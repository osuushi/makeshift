import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cases as historicalCases, square } from "../geometry-performance/cases.mjs";
import { operand } from "../geometry-performance/client.mjs";
import { prepareCases } from "./cases.mjs";
import { sweepCases } from "./sweep-cases.mjs";

const frame = (z) => ({ origin: [0, 0, z], u: [1, 0, 0], v: [0, 1, 0] });
const extrude = (profile, distance = 20) => ({
  kind: "extrude",
  profiles: [profile],
  normal: [0, 0, 1],
  distance,
  mode: "new",
  bodies: [],
});
const circle = (radius, z = 0) => ({
  outer: [{ kind: "circle", center: [0, 0, z], radius, normal: [0, 0, 1], axis: [1, 0, 0] }],
  holes: [],
  frame: frame(z),
});

async function stockCases(client) {
  const list = [];
  for (const [name, profile] of [
    ["box", square(-10, -10, 20)],
    ["cylinder", circle(10)],
  ]) {
    const input = extrude(profile);
    const { reply } = await client.request(input);
    assert.equal(reply.error, undefined);
    const result = reply.results[0];
    const body = operand(result, name);
    const finishEdge =
      name === "cylinder"
        ? result.edges.findIndex(
            (edge) => edge.curve?.kind === "circle" || edge.curve?.kind === "arc",
          )
        : 0;
    assert.ok(finishEdge >= 0);
    const top = result.faces.findIndex((f) => f.plane && Math.abs(f.plane.origin[2] - 20) < 1e-6);
    assert.ok(top >= 0);
    list.push([`primitive-${name}`, input]);
    for (const deflection of [0.05, 0.005])
      list.push([`inspect-${name}-${deflection}`, { kind: "inspect", bodies: [body], deflection }]);
    for (const mode of ["fillet", "chamfer"])
      list.push([
        `${mode}-${name}`,
        {
          kind: "edge-finish",
          mode,
          size: 1,
          bodies: [body],
          edges: [{ body: body.id, edge: body.edges[finishEdge].id }],
        },
      ]);
    list.push([
      `offset-${name}`,
      {
        kind: "offset-faces",
        bodies: [body],
        distance: 2,
        faces: [{ body: body.id, face: body.faces[top].id }],
      },
    ]);
    list.push([
      `cut-${name}`,
      {
        kind: "plane-cut",
        bodies: [body],
        mode: "split",
        targets: [{ body: body.id }],
        frame: frame(10),
      },
    ]);
    list.push([
      `scale-${name}`,
      {
        kind: "scale",
        bodies: [body],
        ids: [body.id],
        pivot: [0, 0, 0],
        factor: 1.5,
      },
    ]);
    list.push([`draft-${name}`, { ...input, draft: { mode: "offset", value: 2 } }]);
  }
  return list;
}

function constructionCases() {
  const list = [];
  for (const ruled of [true, false])
    list.push([
      `loft-${ruled ? "ruled" : "smooth"}`,
      {
        kind: "loft",
        mode: "new",
        bodies: [],
        ruled,
        profiles: [circle(5), circle(8, 10), circle(4, 20)],
      },
    ]);
  for (const curved of [false, true])
    list.push([
      `path-sweep-${curved ? "cubic" : "line"}`,
      {
        kind: "path-sweep",
        mode: "new",
        bodies: [],
        profiles: [circle(2)],
        path: [
          curved
            ? { kind: "bezier", a: [0, 0, 0], c1: [0, 0, 10], c2: [20, 0, 10], b: [20, 0, 20] }
            : { kind: "line", a: [0, 0, 0], b: [0, 0, 20] },
        ],
      },
    ]);
  return list;
}

export async function prepareBroadCases(client) {
  const captured = await prepareCases(client);
  const historical = await historicalCases(client);
  const slow = JSON.parse(await readFile("tests/fixtures/slow-face-delete.json", "utf8"));
  const list = [
    ...(await stockCases(client)),
    ...constructionCases(),
    ...sweepCases,
    ...historical,
    [
      "captured-delete",
      {
        kind: "delete-topology",
        bodies: slow.document.bodies,
        selection: [
          { body: slow.document.bodies[0].id, whole: false, faces: [slow.face], edges: [] },
        ],
      },
    ],
  ];
  const rejections = {
    "captured-delete": "These faces cannot be deleted while keeping a closed solid",
    "shell-bent-sweep-closed": "Solid boundary does not meet its incident surfaces",
    "rimmed-corners-2mm": "Edge finish is not feasible at this size",
  };
  return {
    ...captured,
    cases: [...list.map(([name, input]) => ({ name, input })), ...captured.cases].map(
      (scenario) => ({ ...scenario, rejection: rejections[scenario.name] ?? null }),
    ),
  };
}
