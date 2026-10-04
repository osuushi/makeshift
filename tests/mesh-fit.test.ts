import assert from "node:assert/strict";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { sharpBox, sphereFit, torusFit } from "./mesh-fit-fixtures.js";

for (const [name, input, volume] of [
  ["sharp box", sharpBox(), 8000],
  ["sphere", sphereFit(), (4 * Math.PI * 1000) / 3],
  ["ellipsoid", sphereFit([16, 10, 6]), (4 * Math.PI * 16 * 10 * 6) / 3],
  ["torus", torusFit(), 2 * Math.PI ** 2 * 20 * 36],
] as const)
  test(`mesh fit creates an editable solid: ${name}`, async () => {
    const kernel = new SolidCalculator();
    try {
      const result = await kernel.calculate({ ...input, kind: "fit-mesh", bodies: [] });
      assert.equal(result.results.length, 1);
      assert(result.fit.sampledMeshToSurface <= input.tolerance);
      assert(result.fit.sampledSurfaceToMesh <= input.tolerance);
      assert(result.fit.sampledSeamAngle <= 5);
      assert(
        Math.abs(result.results[0].volume / volume - 1) < 0.035,
        `${result.results[0].volume} vs ${volume}`,
      );
      console.log(name, result.fit, "volume", result.results[0].volume);
    } finally {
      kernel.close();
    }
  });
