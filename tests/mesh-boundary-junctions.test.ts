import assert from "node:assert/strict";
import test from "node:test";
import { type ExportMesh, validateMesh } from "../src/model/export-mesh.js";
import { stitchBoundaryJunctions } from "../src/model/mesh-boundary-junctions.js";
import { encodeMeshes } from "../src/model/mesh-export.js";

const triangles = [
  [0, 2, 1],
  [0, 4, 3],
  [4, 1, 3],
  [1, 2, 3],
  [2, 0, 3],
];
const mesh: ExportMesh = {
  vertices: [
    [0, 0, 0],
    [2, 0, 0],
    [0, 2, 0],
    [0, 0, 2],
    [1, 0, 0],
  ],
  triangles,
};

test("a tangent boundary T-junction splits its opposite edge without moving vertices", () => {
  assert.throws(() => validateMesh(mesh), /not closed/);
  const before = structuredClone(mesh);
  const result = stitchBoundaryJunctions(mesh);
  validateMesh(result);
  assert.equal(result.vertices, mesh.vertices);
  assert.equal(result.triangles.length, mesh.triangles.length + 1);
  assert.deepEqual(mesh, before);
  assert.equal(stitchBoundaryJunctions(result), result, "closed meshes need no repair");
});

test("boundary stitching rejects actual holes, finite gaps and reversed facets", () => {
  const displaced = structuredClone(mesh);
  displaced.vertices[4][1] = 1e-10;
  const reversed = {
    ...mesh,
    triangles: mesh.triangles.map((t, i) => (i === 1 ? [...t].reverse() : t)),
  };
  for (const invalid of [displaced, reversed, { ...mesh, triangles: triangles.slice(1) }]) {
    assert.equal(stitchBoundaryJunctions(invalid), invalid);
    assert.throws(() => validateMesh(invalid), /not closed/);
  }
});

test("STL preserves closure when tangent-circle coordinates become collinear in Float32", () => {
  // Boundary coordinates captured from the failing Linux annulus-on-disk export.
  const source: ExportMesh = {
    vertices: [
      [10, 0, 0],
      [9.950307753654014, 0.9956784659581672, 0],
      [8, 0, 0],
      [10, 0, 2],
      [9.975153876827008, 0.4978392329790833, 0],
    ],
    triangles: [...triangles, [0, 1, 4]],
  };
  validateMesh(source);
  const before = structuredClone(source);
  const bytes = encodeMeshes([source], "stl");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result: ExportMesh = { vertices: [], triangles: [] };
  const ids = new Map<string, number>();
  for (let offset = 84; offset < bytes.length; offset += 50) {
    const triangle: number[] = [];
    for (const vertex of [12, 24, 36]) {
      const point = [0, 4, 8].map((axis) => data.getFloat32(offset + vertex + axis, true));
      const key = point.join(",");
      let id = ids.get(key);
      if (id === undefined) {
        id = result.vertices.length;
        result.vertices.push(point);
        ids.set(key, id);
      }
      triangle.push(id);
    }
    result.triangles.push(triangle);
  }
  validateMesh(result);
  assert.equal(result.triangles.length, source.triangles.length);
  assert.deepEqual(source, before);
  assert.deepEqual(
    result.vertices.map((p) => p.join(",")).sort(),
    source.vertices.map((p) => p.map(Math.fround).join(",")).sort(),
  );
});
