import assert from "node:assert/strict";
import test from "node:test";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { planes } from "../src/sketch/planes.js";
import { touchSketchTarget } from "../src/sketch/touch-sketch-target.js";

test("touch entry uses projected distance and excludes hidden sketches", () => {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: [
      {
        id: "line",
        kind: "segment",
        construction: false,
        a: { x: -100, y: 0 },
        b: { x: 100, y: 0 },
      },
    ],
  };
  let visible = true;
  const editor = {
    display: { sketches: [sketch] },
    visibility: { visible: () => visible },
    world: {
      height: 100,
      canvas: { clientHeight: 100 },
      visiblePoint: () => true,
      projectLocal: (_plane: unknown, point: { x: number; y: number }) => ({
        x: point.x * 0.1,
        y: point.y,
      }),
    },
  } as unknown as SketchEditor;
  assert.equal(touchSketchTarget(editor, { x: 0, y: 21 })?.sketch, sketch.id);
  assert.equal(touchSketchTarget(editor, { x: 0, y: 23 }), null);
  assert.equal(touchSketchTarget(editor, { x: 31, y: 0 })?.sketch, sketch.id);
  assert.equal(touchSketchTarget(editor, { x: 33, y: 0 }), null);
  visible = false;
  assert.equal(touchSketchTarget(editor, { x: 0, y: 0 }), null);
});
