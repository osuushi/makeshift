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
const operations = [
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
async function run(client, input) {
  const first = await client.request(input);
  if (first.reply.error) throw new Error(first.reply.error);
  const full = input.presentation
    ? await client.request({ kind: "complete-preview", bodies: [] })
    : first;
  if (full.reply.error) throw new Error(full.reply.error);
  return { first, full, total: first.milliseconds + (full === first ? 0 : full.milliseconds) };
}
for (const [operation, request] of operations) {
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
