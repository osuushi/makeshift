import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { Client } from "./client.mjs";

// Compare native edits on a selected planar face from Capture fixture.
// Pass --reference to check every reply, including exact BReps and render data.
const {
  positionals: [path],
  values,
} = parseArgs({
  allowPositionals: true,
  options: {
    kernel: { type: "string", default: ".build/kernel/bin/makeshift-kernel" },
    reference: { type: "string" },
    mm: { type: "string", default: "1" },
    "split-depth": { type: "string" },
    threads: { type: "string", default: String(availableParallelism()) },
  },
});
if (!path) throw new Error("Supply a Makeshift fixture with one selected planar face");
const { snapshot } = JSON.parse(await readFile(path, "utf8"));
const [selection] = snapshot.modelingSelection;
const owner = snapshot.document.bodies.find((b) => b.id === selection?.body);
const face = owner?.faces.find((f) => f.id === selection?.face);
if (snapshot.modelingSelection.length !== 1 || !face?.plane)
  throw new Error("Select one planar face before capturing");
const mm = Number(values.mm),
  threads = Number(values.threads);
if (!(Number.isFinite(mm) && mm > 0 && Number.isInteger(threads) && threads > 0))
  throw new Error("Supply positive millimeters and a positive thread count");
const entity = ({ id, signature }) => ({ id, signature });
const body = ({ id, brep, faces, edges }) => ({
  id,
  brep,
  faces: faces.map(entity),
  edges: edges.map(entity),
});
const source = body(owner),
  bodies = snapshot.document.bodies.map(body);
const { u, v } = face.plane;
const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const sources = [{ body: owner.id, face: face.id }];
const edges = [...new Set(face.edges)].map((edge) => ({ body: owner.id, edge }));
function editCases(source, bodies) {
  const extrude = (distance) => ({
    kind: "extrude",
    mode: "auto",
    profiles: [{ face: face.id }],
    normal,
    distance,
    bodies,
  });
  const offset = (distance) => ({
    kind: "offset-faces",
    faces: sources,
    distance,
    bodies: [source],
    presentation: "deferred",
  });
  return [
    ["extrude", extrude],
    ["cut", (size) => extrude(-size)],
    ["offset", offset],
    ["inset", (size) => offset(-size)],
    [
      "fillet",
      (size) => ({
        kind: "edge-finish",
        mode: "fillet",
        edges,
        size,
        bodies: [source],
        presentation: "deferred",
      }),
    ],
  ];
}
async function run(client, input) {
  const first = await client.request(input);
  if (first.reply.error) throw new Error(first.reply.error);
  const full = input.presentation
    ? await client.request({ kind: "complete-preview", bodies: [] })
    : first;
  if (full.reply.error) throw new Error(full.reply.error);
  return { first, full, total: first.milliseconds + (full === first ? 0 : full.milliseconds) };
}
async function splitEnd(depth) {
  if (!Number.isFinite(depth) || depth <= 0)
    throw new Error("Supply a positive split depth in millimeters");
  const cutter = new Client(values.kernel, threads);
  try {
    const { reply } = await cutter.request({
      kind: "plane-cut",
      mode: "split",
      bodies: [source],
      targets: [{ body: owner.id }],
      frame: { u, v, origin: face.plane.origin.map((x, i) => x - depth * normal[i]) },
    });
    if (reply.error) throw new Error(reply.error);
    const parts = reply.results.filter((part) =>
      part.faces.some((f) => f.predecessors.includes(face.id)),
    );
    if (reply.results.length < 2 || parts.length !== 1)
      throw new Error("The plane must isolate the selected cap");
    const [part] = parts;
    const wanted = new Set([face.id, ...face.edges]);
    const seen = new Set();
    const ids = (entities, kind) =>
      entities.map((e, i) => {
        const labels = e.predecessors.filter((id) => wanted.has(id));
        if (labels.length > 1 || (labels.length && seen.has(labels[0])))
          throw new Error("The split intersects the face or its rim");
        if (labels.length) seen.add(labels[0]);
        return { id: labels[0] ?? `split-${kind}-${i}`, signature: e.signature };
      });
    const local = {
      id: source.id,
      brep: part.brep,
      faces: ids(part.faces, "face"),
      edges: ids(part.edges, "edge"),
    };
    if (seen.size !== wanted.size) throw new Error("The split changed the selected rim");
    return local;
  } finally {
    await cutter.close();
  }
}
const models = [{ name: "whole", source, bodies }];
if (values["split-depth"] !== undefined) {
  const end = await splitEnd(Number(values["split-depth"]));
  models.push({ name: "split", source: end, bodies: [end] });
}
for (const model of models)
  for (const [operation, request] of editCases(model.source, model.bodies)) {
    const clients = [values.reference, values.kernel]
      .filter(Boolean)
      .map((path) => new Client(path, threads));
    try {
      for (const [index, factor] of [1, 0.9, 1.1, 1].entries()) {
        const samples = [];
        const input = request(mm * factor);
        for (const client of clients) samples.push(await run(client, input));
        const same = samples.every(
          (s) =>
            isDeepStrictEqual(s.first.reply, samples[0].first.reply) &&
            isDeepStrictEqual(s.full.reply, samples[0].full.reply),
        );
        console.log(
          JSON.stringify({
            operation,
            ...(models.length > 1 ? { body: model.name, faces: model.source.faces.length } : {}),
            mm: mm * factor,
            cold: index === 0,
            samples: samples.map((s) => ({
              firstMs: Math.round(s.first.milliseconds),
              completeMs: Math.round(s.total),
            })),
            ...(clients.length === 2 ? { identical: same } : {}),
          }),
        );
        if (!same) throw new Error(`Kernel replies differ for ${operation} at ${mm * factor} mm`);
      }
    } finally {
      for (const client of clients) await client.close();
    }
  }
