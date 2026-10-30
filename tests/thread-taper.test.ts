import assert from "node:assert/strict";
import test from "node:test";
import { threadRadius } from "../src/decorators/thread-mesh.js";
import {
  patchThreadSettings,
  threadDefaults,
  threadDepth,
} from "../src/decorators/thread-settings.js";

test("both thread ends remove material for every profile and cut mode", () => {
  for (const profile of ["triangle", "metric", "rounded"] as const)
    for (const cut of ["rod", "hole"] as const)
      for (const outward of [1, -1] as const) {
        const settings = { ...threadDefaults(10), profile, cut, startTaper: 1, endTaper: 1 };
        const untapered = { ...settings, startTaper: 0, endTaper: 0 };
        const depth = threadDepth(settings);
        const end =
          5 +
          (outward > 0
            ? cut === "rod"
              ? -depth
              : 0
            : (cut === "hole" ? depth : 0) + settings.clearance);
        for (const z of [0, 0.25, 0.75, 1, 5, 9, 9.25, 9.75, 10])
          for (let step = 0; step < 32; step++) {
            const angle = (step * Math.PI) / 16;
            const actual = threadRadius(5, angle, z, settings, outward, [0, 10]);
            const original = threadRadius(5, angle, z, untapered, outward, [0, 10]);
            assert.ok(outward * (actual - original) <= 1e-12);
            if (z === 0 || z === 10) assert.ok(Math.abs(actual - end) < 1e-12);
            if (z >= 1 && z <= 9) assert.ok(Math.abs(actual - original) < 1e-12);
          }
      }
});

test("creating and choosing built-in presets applies half-pitch tapers at both ends", () => {
  for (const preset of ["fdm-fine", "fdm-coarse", "metric"] as const) {
    const defaults = threadDefaults(13, preset);
    const selected = patchThreadSettings(
      13,
      { ...threadDefaults(13), startTaper: 3, endTaper: 0 },
      { preset },
    );
    for (const settings of [defaults, selected]) {
      assert.equal(settings.startTaper, settings.pitch / 2);
      assert.equal(settings.endTaper, settings.pitch / 2);
    }
  }
});
