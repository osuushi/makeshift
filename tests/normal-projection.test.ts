import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { projectPreviewNormals } from "../src/decorators/normal-projection.js";
import { normalChart } from "../src/decorators/normal-projection-charts.js";
import { NormalProjectionRays } from "../src/decorators/normal-projection-rays.js";
import type { Face } from "../src/model/body.js";
import type { DisplayDocument } from "../src/model/display-document.js";

const support: Face = {
  id: "face",
  edges: [],
  signature: [],
  plane: { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] },
  vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
};
const mesh = {
  positions: new Float32Array([-2, -2, -1, 4, -2, 2, -2, 4, -1]),
  indices: new Uint32Array([0, 1, 2]),
  faces: [{ body: "body", face: "face" }],
};
const document: DisplayDocument = {
  units: "mm",
  sketches: [],
  bodies: [
    {
      id: "body",
      volume: 1,
      center: [0, 0, 0],
      bounds: [0, 0, 0, 1, 1, 0],
      faces: [support],
      edges: [],
    },
  ],
};

test("normal projection bakes generated relief without changing support geometry or document", () => {
  const before = structuredClone(document);
  const [projection] = projectPreviewNormals(document, mesh, 16);
  assert.deepEqual(document, before);
  assert.deepEqual([...projection.positions], support.vertices);
  assert.deepEqual([...projection.uv], [0, 0, 1, 0, 0, 1]);
  const expected = new THREE.Vector3(-0.5, 0, 1).normalize();
  for (let i = 0; i < projection.normals.length; i += 4) {
    const actual = new THREE.Vector3(
      ...[0, 1, 2].map((j) => (projection.normals[i + j] / 255) * 2 - 1),
    );
    assert.ok(actual.distanceTo(expected) < 0.01);
  }
  assert.deepEqual(projectPreviewNormals(document, { ...mesh, indices: new Uint32Array() }), []);
});

test("rays capture both recessed and raised relief, reject opposite walls, and retain uncovered normals", () => {
  const rays = new NormalProjectionRays(mesh);
  const normal = new THREE.Vector3(0, 0, 1);
  for (const z of [-3, 3]) assert.ok(rays.normal(new THREE.Vector3(0, 0, z), normal).x < -0.4);
  assert.deepEqual(rays.normal(new THREE.Vector3(20, 20, 0), normal).toArray(), [0, 0, 1]);
  const opposite = new NormalProjectionRays({ ...mesh, indices: new Uint32Array([2, 1, 0]) });
  assert.deepEqual(opposite.normal(new THREE.Vector3(0, 0, 0), normal).toArray(), [0, 0, 1]);
});

test("cylinder UV seams interpolate locally and radial samples follow the analytic surface", () => {
  const angles = [Math.PI - 0.1, -Math.PI + 0.1, Math.PI - 0.1];
  const face: Face = {
    ...support,
    plane: null,
    cylinder: { origin: [3, 4, 5], axis: [0, 0, 1], radius: 2, outward: -1 },
    vertices: angles.flatMap((a, i) => [3 + 2 * Math.cos(a), 4 + 2 * Math.sin(a), 5 + i]),
  };
  const chart = normalChart(face, 32);
  const values = [chart.uv[0], chart.uv[2], chart.uv[4]];
  assert.ok(Math.max(...values) - Math.min(...values) < 0.1);
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  chart.sample(0.5, 0.5, point, normal);
  assert.ok(point.distanceTo(new THREE.Vector3(5, 4, 6)) < 1e-9);
  assert.deepEqual(
    normal.toArray().map((v) => v || 0),
    [-1, 0, 0],
  );
});

test("arbitrary faces use padded triangle charts without moving the support", () => {
  const chart = normalChart({ ...support, plane: null }, 32);
  const point = new THREE.Vector3(),
    normal = new THREE.Vector3();
  for (let corner = 0; corner < 3; corner++) {
    chart.sample(chart.uv[corner * 2], chart.uv[corner * 2 + 1], point, normal);
    assert.ok(point.distanceTo(new THREE.Vector3().fromArray(support.vertices, corner * 3)) < 1e-6);
    assert.deepEqual(normal.toArray(), [0, 0, 1]);
  }
});
