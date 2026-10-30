import assert from "node:assert/strict";
import test from "node:test";
import { axisGuideSnap } from "../src/model/axis-guide-snap.js";
import { emptySketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { planes } from "../src/sketch/planes.js";

function fixture(hidden = false): SketchEditor {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "line",
        kind: "segment" as const,
        construction: false,
        a: { x: 30, y: 45 },
        b: { x: 60, y: 45 },
      },
    ],
  };
  return {
    store: {
      data: {
        sketches: [sketch],
        guidePoints: [
          {
            id: "guide",
            name: "Target",
            hidden,
            anchor: { kind: "sketch-curve", sketch: sketch.id, curve: "line", feature: "start" },
          },
        ],
      },
    },
    visibility: { visible: () => true },
    world: {
      activeFrame: null,
      visiblePoint: () => true,
      project: (p: number[]) => ({ x: p[0], y: p[1] }),
      canvas: { getBoundingClientRect: () => ({ x: 100, y: 200 }) },
    },
  } as unknown as SketchEditor;
}
test("arrow snap uses the guide coordinate along the starting anchor axis", () => {
  assert.equal(axisGuideSnap(fixture(), [5, 7, 9], [1, 0, 0], 130, 245), 25);
  assert.equal(axisGuideSnap(fixture(), [5, 7, 9], [0, 0, 1], 130, 245), -9);
  const amount = axisGuideSnap(fixture(), [5, 7, 9], [0.6, 0.8, 0], 130, 245);
  assert.ok(amount !== null && Math.abs(amount - 45.4) < 1e-10);
});
test("guide snap requires a visible guide within cursor hit range", () => {
  assert.equal(axisGuideSnap(fixture(true), [0, 0, 0], [1, 0, 0], 130, 245), null);
  assert.equal(axisGuideSnap(fixture(), [0, 0, 0], [1, 0, 0], 150, 245), null);
});
