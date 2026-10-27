import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body } from "../src/model/body.js";
import { type Curve, emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export type Stock = "box" | "cylinder" | "pocket";
const circle = (id: string, x: number, y: number, radius: number): Curve => ({
  id,
  kind: "circle",
  center: { x, y },
  radius,
  construction: false,
});
function rectangle(id: string, x0: number, y0: number, x1: number, y1: number): Curve[] {
  const points = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  return points.map(([x, y], i) => ({
    id: id + i,
    kind: "segment",
    a: { x, y },
    b: { x: points[(i + 1) % 4][0], y: points[(i + 1) % 4][1] },
    construction: false,
  }));
}

async function extrude(owner: DocumentOwner, curves: Curve[], distance: number, subtract = false) {
  const sketch = {
    ...emptySketch({ ...planes.XY, origin: [0, 0, subtract ? 30 : 0] }),
    curves,
  };
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: profilesFor(sketch).map((profile) => ({
            sketch: sketch.id,
            profile: profile.key,
          })),
          distance,
          mode: subtract ? "subtract" : "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  return body;
}
export function stock(owner: DocumentOwner, kind: Stock) {
  return extrude(
    owner,
    kind === "cylinder" ? [circle("rim", 0, 0, 20)] : rectangle("side", -20, -20, 20, 20),
    30,
  );
}
export function cutOpenings(owner: DocumentOwner, kind: Stock) {
  const curves =
    kind === "box"
      ? [circle("hole-a", -10, -12, 3), circle("hole-b", 10, -12, 3)]
      : kind === "cylinder"
        ? [circle("hole", 0, -14, 2)]
        : rectangle("pocket", -10, -15, 10, -11);
  return extrude(owner, curves, kind === "pocket" ? -2 : -30, true);
}
export function rimEdges(body: Body) {
  return body.edges.filter((edge) =>
    edge.curve?.kind === "circle"
      ? Math.abs(edge.curve.radius - 20) < 1e-7 && Math.abs(edge.curve.center[2] - 30) < 1e-7
      : edge.curve?.kind === "line" &&
        [edge.curve.a, edge.curve.b].every(
          (p) => Math.abs(p[2] - 30) < 1e-7 && (Math.abs(p[0]) === 20 || Math.abs(p[1]) === 20),
        ),
  );
}

export async function sameSolid(actual: Body, expected: Body) {
  const kernel = new SolidCalculator();
  const other = {
    ...expected,
    id: "expected",
    faces: expected.faces.map((face) => ({ ...face, id: `expected-${face.id}` })),
    edges: expected.edges.map((edge) => ({ ...edge, id: `expected-${edge.id}` })),
  };
  try {
    for (const ids of [
      [actual.id, other.id],
      [other.id, actual.id],
    ]) {
      const result = await kernel.calculate({
        kind: "boolean",
        mode: "subtract",
        keepOriginals: false,
        ids,
        bodies: [actual, other],
      });
      assert.ok(
        result.results.reduce((sum, body) => sum + body.volume, 0) < 1e-6,
        "Filleting through interruptions must equal constructing the round before cutting the openings",
      );
    }
  } finally {
    kernel.close();
  }
}
