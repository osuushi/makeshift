import assert from "node:assert/strict";
import test from "node:test";
import type { Body, Edge, Face } from "../src/model/body.js";
import { edgeViewportDirection } from "../src/model/edge-finish-direction.js";
import { edgeSurfaceMotion } from "../src/model/edge-finish-motion.js";

const edge: Edge = {
  id: "edge",
  signature: [],
  points: [0, 0, -1, 0, 0, 1],
  curve: { kind: "line", a: [0, 0, -1], b: [0, 0, 1] },
};
const face = (id: string, vertices: number[]): Face => ({
  id,
  vertices,
  edges: [edge.id],
  signature: [],
  plane: null,
});
const convex = [face("x", [0, 0, -1, 0, 0, 1, 0, -4, 0]), face("y", [0, 0, -1, -4, 0, 0, 0, 0, 1])];
const concave = [face("x", [0, 0, -1, 0, 4, 0, 0, 0, 1]), face("y", [0, 0, -1, 0, 0, 1, 4, 0, 0])];
const body = (faces: Face[]): Body => ({
  id: "body",
  brep: "",
  volume: 1,
  center: [0, 0, 0],
  bounds: [-4, -4, -1, 4, 4, 1],
  edges: [edge],
  faces,
});
const outward: [number, number, number] = [Math.SQRT1_2, Math.SQRT1_2, 0];

test("convex edge sizing cuts inward and concave sizing fills the recess", () => {
  assert.deepEqual(
    edgeSurfaceMotion(body(convex), edge, [0, 0, 0], outward),
    outward.map((v) => -v),
  );
  assert.deepEqual(edgeSurfaceMotion(body(concave), edge, [0, 0, 0], outward), outward);
  // Large triangles retain the same local corner sign; no distant surface center is used.
  const large = convex.map((face) => ({ ...face, vertices: face.vertices.map((v) => v * 1e6) }));
  assert.deepEqual(
    edgeSurfaceMotion(body(large), edge, [0, 0, 0], outward),
    outward.map((v) => -v),
  );
});

test("conflicting, tangent, opposing, seam and degenerate evidence falls back to numeric input", () => {
  const conflict = [
    { ...convex[0], vertices: [...convex[0].vertices, ...concave[0].vertices] },
    convex[1],
  ];
  assert.equal(edgeSurfaceMotion(body(conflict), edge, [0, 0, 0], outward), null);
  assert.equal(
    edgeSurfaceMotion(
      body([convex[0], { ...convex[0], id: "coplanar" }]),
      edge,
      [0, 0, 0],
      outward,
    ),
    null,
  );
  const opposite = { ...convex[0], id: "opposite", vertices: [0, 0, -1, 0, -4, 0, 0, 0, 1] };
  assert.equal(edgeSurfaceMotion(body([convex[0], opposite]), edge, [0, 0, 0], outward), null);
  assert.equal(edgeSurfaceMotion(body([convex[0]]), edge, [0, 0, 0], outward), null);
  assert.equal(
    edgeSurfaceMotion(
      body([convex[0], { ...convex[1], vertices: Array(9).fill(0) }]),
      edge,
      [0, 0, 0],
      outward,
    ),
    null,
  );
  assert.equal(edgeSurfaceMotion(body(convex), edge, [0, 0, 0], [0, 0, 0]), null);
});

test("signed movement projects independently of the outward glyph and falls back in an axial view", () => {
  const point: [number, number, number] = [2, 3, 4];
  const project = ([x, y]: [number, number, number]) => ({ x, y: -y });
  assert.deepEqual(edgeViewportDirection(point, [-1, 0, 0], project), { x: -1, y: 0 });
  assert.equal(edgeViewportDirection(point, [0, 0, 1], project), null);
});
