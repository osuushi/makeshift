import assert from "node:assert/strict";
import test from "node:test";
import { sketchGridPreferences } from "../src/preferences/sketch-grid.js";
import { defaultSketchGrid, visibleSketchGrid } from "../src/sketch/grid-settings.js";

test("fresh grid preferences default to a 10 pixel minimum", () => {
  assert.equal(sketchGridPreferences().minPixels, 10);
});

test("visible grids meet the pixel minimum and major lines align with minor lines", () => {
  for (const grid of [
    defaultSketchGrid,
    { ...defaultSketchGrid, minor: 3 },
    { ...defaultSketchGrid, minor: 11 },
    { ...defaultSketchGrid, minor: 0.3, major: 1 },
  ]) {
    for (const minPixels of [4, 10, 25]) {
      for (const pixelsPerMm of [0.04, 0.2, 0.39, 0.4, 1, 7.999, 8, 20, 1000]) {
        const shown = visibleSketchGrid(grid, pixelsPerMm, minPixels);
        assert.ok(shown.minor * pixelsPerMm >= minPixels - 1e-10);
        assert.ok(shown.major >= grid.major - 1e-10);
        assert.ok(
          Math.abs(shown.major / grid.major - Math.round(shown.major / grid.major)) < 1e-10,
        );
        const ratio = shown.major / shown.minor;
        assert.ok(Math.abs(ratio - Math.round(ratio)) < 1e-10);
        assert.equal(shown.snap, grid.minor, "Zoom only thins visible lines, never drag steps");
        assert.equal(shown.hideMinor, shown.minor === shown.major);
      }
    }
  }
});

test("zoom thins minor lines without moving the configured major lattice", () => {
  assert.deepEqual(visibleSketchGrid(defaultSketchGrid, 20, 10), {
    minor: 0.5,
    major: 10,
    hideMinor: false,
    snap: 0.5,
  });
  assert.deepEqual(visibleSketchGrid(defaultSketchGrid, 8, 10), {
    minor: 2,
    major: 10,
    hideMinor: false,
    snap: 0.5,
  });
  assert.deepEqual(visibleSketchGrid(defaultSketchGrid, 1, 10), {
    minor: 10,
    major: 10,
    hideMinor: true,
    snap: 0.5,
  });
  assert.deepEqual(visibleSketchGrid({ ...defaultSketchGrid, minor: 3 }, 0.4, 4), {
    minor: 10,
    major: 10,
    hideMinor: true,
    snap: 3,
  });
});
