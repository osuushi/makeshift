import assert from "node:assert/strict";
import test from "node:test";
import { boxHandles, type TransformBox } from "../src/model/transform-box.js";
import { projectedHull } from "../src/model/transform-box-layout.js";
import {
  clearTransformControl,
  displayedTransformBox,
  transformBoxRect,
} from "../src/model/transform-clearance.js";
import { transformLayerState } from "../src/model/transform-layers.js";
import { setUiScale } from "../src/preferences/ui-scale.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import type { Vector } from "../src/sketch/planes.js";

function fixture() {
  const project = ([x, y]: Vector) => ({ x: (x - y) / Math.SQRT2, y: (x + y) / Math.SQRT2 });
  const editor = {
    world: { active: false, project },
    modeling: { targets: [], resolve: () => ({ available: false }) },
  } as unknown as SketchEditor;
  transformLayerState(editor).enter();
  const box: TransformBox = { min: [-100, -100, 0], max: [100, 100, 0], frame: null };
  return { editor, box, project };
}

function rectangleOutside(
  hull: { x: number; y: number }[],
  center: { x: number; y: number },
  halfSize: number,
) {
  const corners = [-1, 1].flatMap((x) =>
    [-1, 1].map((y) => ({ x: center.x + x * halfSize, y: center.y + y * halfSize })),
  );
  return hull.some((a, i) => {
    const b = hull[(i + 1) % hull.length];
    return corners.every((p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0);
  });
}

test("arrow hit rectangles clear oblique box sides at every interface scale", () => {
  const { editor, box, project } = fixture();
  displayedTransformBox(editor, box);
  const hull = projectedHull(boxHandles(box).map((handle) => project(handle.point)));
  try {
    for (const scale of [0.8, 1, 1.25, 1.5]) {
      setUiScale(scale);
      const tip = { x: 60, y: 0 };
      const ratio = clearTransformControl(editor, [0, 0, 0], tip);
      assert.ok(
        rectangleOutside(hull, { x: tip.x * ratio, y: tip.y * ratio }, 24 * scale),
        `scale ${scale}`,
      );
    }
  } finally {
    setUiScale(1);
  }
});

test("current preview scale determines clearance and disabling scale restores nominal controls", () => {
  const { editor, box } = fixture();
  const tip = { x: 60, y: 0 };
  displayedTransformBox(editor, box);
  const initial = clearTransformControl(editor, [0, 0, 0], tip);
  const initialRect = transformBoxRect(editor);
  assert.ok(initialRect);
  displayedTransformBox(editor, box, [0, 0, 0], [2, 2, 1]);
  assert.ok(clearTransformControl(editor, [0, 0, 0], tip) > initial);
  const scaledRect = transformBoxRect(editor);
  assert.ok(scaledRect);
  assert.equal(scaledRect.width, initialRect.width * 2);
  assert.equal(scaledRect.height, initialRect.height * 2);
  transformLayerState(editor).enter("move");
  assert.equal(clearTransformControl(editor, [0, 0, 0], tip), 1);
  assert.equal(transformBoxRect(editor), null);
  displayedTransformBox(editor, null);
});
