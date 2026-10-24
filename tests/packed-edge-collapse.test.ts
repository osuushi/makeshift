import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Triangle, Vector3 } from "three";
import { type ExportMesh, validateMesh } from "../src/model/export-mesh.js";
import { encodeMeshes } from "../src/model/mesh-export.js";
import { packedMesh } from "../src/model/packed-mesh.js";

// A closed local patch of the captured thread/cap Boolean, with two vertices
// made identical by float packing. Its original edge pairs are still manifold.
const fixture = JSON.parse(
  readFileSync("tests/fixtures/thread-collapsed-edge.json", "utf8"),
) as ExportMesh;

function surfaceSamplesStayWithin(source: ExportMesh, target: ExportMesh, tolerance: number) {
  const facets = (mesh: ExportMesh) =>
    mesh.triangles
      .map(
        ([a, b, c]) =>
          new Triangle(
            new Vector3(...mesh.vertices[a]),
            new Vector3(...mesh.vertices[b]),
            new Vector3(...mesh.vertices[c]),
          ),
      )
      .filter((t) => t.getArea() > 0);
  const targets = facets(target);
  for (const triangle of facets(source))
    for (let a = 0; a <= 4; a++)
      for (let b = 0; b <= 4 - a; b++) {
        const point = triangle.a
          .clone()
          .multiplyScalar(a / 4)
          .addScaledVector(triangle.b, b / 4)
          .addScaledVector(triangle.c, 1 - (a + b) / 4);
        const distance = Math.min(
          ...targets.map((t) => t.closestPointToPoint(point, new Vector3()).distanceTo(point)),
        );
        assert.ok(distance <= tolerance, `Surface moved ${distance} mm`);
      }
}

test("packing preserves closure when a collapsed edge would join two other edges", () => {
  const original = structuredClone(fixture);
  const result = packedMesh(fixture, 4e-6);
  validateMesh(result);
  assert.deepEqual(result.vertices, fixture.vertices);
  assert.equal(result.triangles.length, 26);
  assert.deepEqual(fixture, original);
  surfaceSamplesStayWithin(fixture, result, 4e-6);
  surfaceSamplesStayWithin(result, fixture, 4e-6);
  for (const format of ["stl", "3mf"] as const)
    assert.ok(encodeMeshes([{ ...result, precision: 0.001 }], format).length > 100);
});

test("a collapsed edge still fails when no retriangulation fits the rounding budget", () => {
  assert.throws(() => validateMesh(packedMesh(fixture, 1e-8)), /closed/);
});

test("packing does not repair an already nonmanifold edge or an open shell", () => {
  const merged = {
    ...fixture,
    triangles: fixture.triangles
      .map((t) => t.map((v) => (v === 8 ? 0 : v)))
      .filter((t) => new Set(t).size === 3),
  };
  assert.throws(() => validateMesh(packedMesh(merged, 4e-6)), /closed/);
  const open = { ...fixture, triangles: fixture.triangles.slice(1) };
  assert.throws(() => validateMesh(packedMesh(open, 4e-6)), /closed/);
});
