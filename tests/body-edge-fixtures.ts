import assert from "node:assert/strict";
import type { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Edge } from "../src/model/body.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

export async function prism(owner: DocumentOwner, points: number[][], depth = 10): Promise<Body> {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: points.map(([x, y], i) => ({
      id: `line${i}`,
      kind: "segment",
      a: { x, y },
      b: { x: points[(i + 1) % points.length][0], y: points[(i + 1) % points.length][1] },
      construction: false,
    })),
  };
  return lift(owner, sketch, depth);
}
export async function lift(owner: DocumentOwner, sketch: Sketch, depth = 10): Promise<Body> {
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
          distance: depth,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  return owner.view.data.bodies?.at(-1) as Body;
}
export function vertical(body: Body, x: number, y: number): Edge {
  const edge = body.edges.find(
    (e) =>
      e.curve?.kind === "line" &&
      e.points.every((v, i) => i % 3 === 2 || Math.abs(v - (i % 3 === 0 ? x : y)) < 1e-7),
  );
  assert.ok(edge);
  return edge;
}
export async function finish(
  owner: DocumentOwner,
  body: Body,
  edges: Edge[],
  radius: number,
  mode: "fillet" | "chamfer" = "fillet",
) {
  const reply = await owner.call({
    kind: "finish-edges",
    operation: {
      edges: edges.map((edge) => ({ body: body.id, edge: edge.id })),
      size: radius,
      mode,
    },
  });
  assert.equal(reply.error, undefined);
  const candidate = reply.view.candidate?.bodies?.find((b) => b.id === body.id);
  assert.ok(candidate);
  return candidate;
}
export const square = [
  [0, 0],
  [20, 0],
  [20, 20],
  [0, 20],
];

export async function splitCylinder(owner: DocumentOwner): Promise<Body> {
  return lift(owner, {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "half1",
        kind: "arc",
        a: { x: -5, y: 0 },
        b: { x: 5, y: 0 },
        bulge: 1,
        construction: false,
      },
      {
        id: "half2",
        kind: "arc",
        a: { x: 5, y: 0 },
        b: { x: -5, y: 0 },
        bulge: 1,
        construction: false,
      },
    ],
  });
}
