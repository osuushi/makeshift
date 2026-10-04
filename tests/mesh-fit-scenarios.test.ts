import assert from "node:assert/strict";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { MeshFitInput } from "../src/model/mesh-fit.js";
import { sphereFit } from "./mesh-fit-fixtures.js";
import {
  cylinderFit,
  noisySphere,
  nonuniformSphere,
  smallHoleTorus,
  smoothShape,
  transformed,
} from "./mesh-fit-shapes.js";

const scenarios: [string, () => MeshFitInput, number?][] = [
  ["mixed sharp rims and smooth cylinder walls", cylinderFit, Math.PI * 100 * 20],
  [
    "bent elongated body",
    () => smoothShape(([x, y, z]) => [6 * x + 4 * z * z, 6 * y, 20 * z], 4),
    (4 * Math.PI * 6 * 6 * 20) / 3,
  ],
  [
    "strongly bent body with conditioned corner tangents",
    () => smoothShape(([x, y, z]) => [6 * x + 12 * z * z, 6 * y, 20 * z], 4),
    (4 * Math.PI * 6 * 6 * 20) / 3,
  ],
  [
    "small rotated strongly bent body",
    () =>
      transformed(
        smoothShape(([x, y, z]) => [6 * x + 12 * z * z, 6 * y, 20 * z], 4),
        0.01,
        [1, -2, 3],
      ),
    (4 * Math.PI * 6 * 6 * 20) / 3e6,
  ],
  [
    "three asymmetric lobes",
    () =>
      smoothShape(([x, y, z]) => {
        const r = 10 * (1 + 0.25 * (x * x * x - 3 * x * y * y));
        return [r * x, r * y, r * z];
      }, 2),
  ],
  [
    "waisted body",
    () => smoothShape(([x, y, z]) => [10 * x * (0.6 + z * z), 10 * y * (0.6 + z * z), 16 * z], 2),
  ],
  [
    "thin ellipsoid",
    () => ({
      ...smoothShape(([x, y, z]) => [15 * x, 10 * y, 1.5 * z], 4),
      tolerance: 0.05,
      maxPatches: 96,
    }),
    (4 * Math.PI * 15 * 10 * 1.5) / 3,
  ],
  ["noisy target", noisySphere, (4 * Math.PI * 1000) / 3],
  ["uneven triangle density", nonuniformSphere, (4 * Math.PI * 1000) / 3],
  ["narrow torus hole", smallHoleTorus, 2 * Math.PI ** 2 * 10 * 81],
  [
    "small rotated translated model",
    () => transformed(sphereFit(), 0.01, [1, -2, 3]),
    (4 * Math.PI * 0.001) / 3,
  ],
  [
    "large rotated far-from-origin model",
    () => transformed(sphereFit(), 100, [10000, -20000, 30000]),
    (4 * Math.PI * 1e9) / 3,
  ],
];
for (const [name, make, expected] of scenarios)
  test(`mesh fitting scenario: ${name}`, async () => {
    const kernel = new SolidCalculator(),
      input = make();
    try {
      const result = await kernel.calculate({ ...input, kind: "fit-mesh", bodies: [] });
      assert.equal(result.results.length, 1);
      assert(result.fit.sampledMeshToSurface <= input.tolerance);
      assert(result.fit.sampledSurfaceToMesh <= input.tolerance);
      assert(result.fit.sampledSeamAngle <= 5);
      if (expected !== undefined)
        assert(
          Math.abs(result.results[0].volume / expected - 1) < 0.04,
          `Expected volume ${expected}, received ${result.results[0].volume}`,
        );
      console.log(name, JSON.stringify(result.fit));
    } finally {
      kernel.close();
    }
  });

test("mesh fitting does not silently omit a localized spike between ordinary fit stations", async () => {
  const kernel = new SolidCalculator(),
    input = sphereFit();
  const vertex = input.mesh.vertices.find((p) => p[2] > 9.9);
  assert(vertex);
  vertex[2] += 4;
  try {
    await assert.rejects(
      kernel.calculate({ ...input, maxPatches: 6, kind: "fit-mesh", bodies: [] }),
      /tolerance|fold|singular/,
    );
  } finally {
    kernel.close();
  }
});
