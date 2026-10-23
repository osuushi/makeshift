import assert from "node:assert/strict";
import test from "node:test";
import { settingsTabBounds } from "../src/host/settings-bounds.js";

const current = { x: 700, y: 700, width: 760, height: 720 };
const frame = { width: 0, height: 28 };
const work = { x: 0, y: 25, width: 1440, height: 950 };

test("Interface has compact native min/preferred/max bounds and stays on screen", () => {
  assert.deepEqual(settingsTabBounds("Interface", 1, current, frame, work), {
    min: { width: 720, height: 278 },
    max: { width: 1000, height: 388 },
    preferred: { x: 680, y: 697, width: 760, height: 278 },
  });
});
test("Toolbox has substantial native working space and fits an offset display", () => {
  assert.deepEqual(
    settingsTabBounds("Toolbox", 1.5, current, frame, {
      x: -1280,
      y: 40,
      width: 1280,
      height: 720,
    }),
    {
      min: { width: 1080, height: 720 },
      max: { width: 1280, height: 720 },
      preferred: { x: -1140, y: 40, width: 1140, height: 720 },
    },
  );
});
test("every pane has ordered scaled bounds including Windows frame width", () => {
  for (const tab of ["Interface", "Sketch Grid", "View", "Decorators", "Experimental", "Toolbox"])
    for (const scale of [0.8, 1, 1.5]) {
      const limits = settingsTabBounds(tab, scale, current, { width: 16, height: 39 }, work);
      for (const axis of ["width", "height"] as const) {
        assert.ok(limits.min[axis] <= limits.preferred[axis]);
        assert.ok(limits.preferred[axis] <= limits.max[axis]);
        assert.ok(limits.max[axis] <= work[axis]);
      }
    }
  assert.throws(() => settingsTabBounds("invalid", 1, current, frame, work));
  assert.throws(() => settingsTabBounds("Interface", Number.NaN, current, frame, work));
});
