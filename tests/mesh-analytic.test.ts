import assert from "node:assert/strict";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { ImportedMesh } from "../src/model/mesh-import.js";
import type { Vector } from "../src/sketch/planes.js";
import { independentMesh, primitiveMesh } from "./mesh-import-fixtures.js";

const rotated = ([x, y, z]: Vector): Vector => {
  const a = 0.73,
    b = 0.41;
  const u = Math.cos(a) * x - Math.sin(a) * y,
    v = Math.sin(a) * x + Math.cos(a) * y;
  return [
    83 + 1.7 * u,
    -41 + 1.7 * (Math.cos(b) * v - Math.sin(b) * z),
    12 + 1.7 * (Math.sin(b) * v + Math.cos(b) * z),
  ];
};
const families = [
  [
    "sphere",
    () => independentMesh("uv"),
    { planes: 0, cylinders: 0, spheres: 1 },
    (4 * Math.PI * 1000) / 3,
  ],
  [
    "cylinder",
    () => primitiveMesh("cylinder"),
    { planes: 2, cylinders: 1, spheres: 0 },
    Math.PI * 36 * 20,
  ],
  [
    "capsule",
    () => primitiveMesh("capsule"),
    { planes: 0, cylinders: 1, spheres: 2 },
    Math.PI * 36 * 20 + (4 * Math.PI * 216) / 3,
  ],
] as const;
for (const [name, make, counts, volume] of families)
  for (const transform of [false, true])
    test(`recover analytic ${name}${transform ? " after rigid placement and scaling" : ""}`, async () => {
      const kernel = new SolidCalculator(),
        mesh = make();
      if (transform) mesh.vertices = mesh.vertices.map(rotated);
      try {
        const result = await kernel.calculate({
          kind: "fit-mesh",
          bodies: [],
          mesh,
          tolerance: transform ? 0.12 : 0.07,
          maxPatches: 24,
        });
        assert.deepEqual(result.fit.analyticFaces, counts);
        assert.equal(result.fit.controlPoints, 0);
        const body = result.results[0];
        assert.equal(body.faces.filter((f) => f.sphere).length, counts.spheres);
        assert.equal(body.faces.filter((f) => f.cylinder).length, counts.cylinders);
        assert.equal(body.faces.filter((f) => f.plane).length, counts.planes);
        assert(Math.abs(body.volume / (volume * (transform ? 1.7 ** 3 : 1)) - 1) < 1e-5);
        assert.equal(result.fit.vertexErrors?.length, mesh.vertices.length);
        assert(result.fit.vertexErrors?.every((error) => error < 1e-4));
      } finally {
        kernel.close();
      }
    });
for (const [name, mesh] of [
  ["ellipsoid", independentMesh("ico", ([x, y, z]) => [10.7 * x, 10 * y, 9.3 * z])],
  ["bent capsule", primitiveMesh("capsule", 6, 20, ([x, y, z]) => [x + 0.008 * y * y, y, z])],
] as const)
  test(`retain bicubic faces for ${name}`, async () => {
    const kernel = new SolidCalculator();
    try {
      const result = await kernel.calculate({
        kind: "fit-mesh",
        bodies: [],
        mesh,
        tolerance: 0.12,
        maxPatches: 96,
      });
      assert.equal(result.fit.analyticFaces, undefined);
      assert(result.fit.controlPoints > 0);
      assert(result.results[0].faces.some((f) => !f.sphere && !f.cylinder && !f.plane));
    } finally {
      kernel.close();
    }
  });
test("analytic candidates cannot erase a narrow inward dent", async () => {
  const kernel = new SolidCalculator();
  const mesh: ImportedMesh = independentMesh("uv");
  const index = mesh.vertices.findIndex(
    ([x, y, z]) => x > 9.9 && Math.abs(y) < 0.1 && Math.abs(z) < 0.1,
  );
  assert(index >= 0);
  mesh.vertices[index] = mesh.vertices[index].map((v) => v * 0.8) as Vector;
  try {
    const result = await kernel
      .calculate({ kind: "fit-mesh", bodies: [], mesh, tolerance: 0.1, maxPatches: 24 })
      .catch(() => null);
    assert(
      !result?.fit.analyticFaces,
      "A local dent must survive or reject, never disappear into a sphere",
    );
  } finally {
    kernel.close();
  }
});
for (const height of [1, 80])
  test(`recover capped cylinder with height ${height} without assuming the longest axis`, async () => {
    const kernel = new SolidCalculator();
    try {
      const result = await kernel.calculate({
        kind: "fit-mesh",
        bodies: [],
        mesh: primitiveMesh("cylinder", 6, height, rotated),
        tolerance: 0.07,
        maxPatches: 24,
      });
      assert.deepEqual(result.fit.analyticFaces, { planes: 2, cylinders: 1, spheres: 0 });
      assert(Math.abs(result.results[0].volume / (Math.PI * 36 * height * 1.7 ** 3) - 1) < 1e-5);
    } finally {
      kernel.close();
    }
  });
test("facet chord error still bounds an exact recovered sphere", async () => {
  const kernel = new SolidCalculator();
  try {
    await assert.rejects(
      kernel.calculate({
        kind: "fit-mesh",
        bodies: [],
        mesh: independentMesh("uv"),
        tolerance: 1e-5,
        maxPatches: 6,
      }),
      /exceeds requested tolerance/,
    );
  } finally {
    kernel.close();
  }
});
