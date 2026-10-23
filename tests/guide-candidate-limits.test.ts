import assert from "node:assert/strict";
import test from "node:test";
import { hoverGuides } from "../src/guides/hover.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { pickingEditor } from "./body-picking-fixtures.js";

function selectedCircles(centers: readonly number[]) {
  const sketch: Sketch = {
    ...emptySketch(planes.XY),
    curves: centers.map((x, index) => ({
      id: `circle-${index}`,
      kind: "circle",
      center: { x, y: 0 },
      radius: 5,
      construction: false,
    })),
  };
  const editor = pickingEditor([]);
  Object.assign(editor.display, { sketches: [sketch] });
  Object.assign(editor, {
    sketch,
    selectionOwners: new Set(sketch.curves.map((curve) => curve.id)),
    hover: null,
  });
  Object.assign(editor.world, { active: true, activeFrame: planes.XY, height: 80 });
  return editor;
}

test("only the three nearest selected candidate markers survive and follow the pointer", () => {
  const editor = selectedCircles([-20, -10, 0, 10, 20]);
  const centers = (x: number) =>
    hoverGuides(editor, editor.world.project([x, 0, 0])).map((candidate) => candidate.point[0]);
  assert.deepEqual(centers(0), [0, -10, 10]);
  assert.deepEqual(centers(15), [10, 20, 0]);
  assert.deepEqual(centers(60), [], "selection never bypasses the 256px pointer radius");
});

test("nearest-three limits markers, preserving all meanings at a coincident location", () => {
  const editor = selectedCircles([-20, -10, 0, 0, 0, 10, 20]);
  const candidates = hoverGuides(editor, editor.world.project([0, 0, 0]));
  assert.deepEqual(
    candidates.map((candidate) => candidate.point[0]),
    [0, 0, 0, -10, 10],
  );
  assert.equal(new Set(candidates.map((candidate) => candidate.point[0])).size, 3);
});

test("crowded candidates are removed before choosing the three nearest markers", () => {
  const editor = selectedCircles([-20, -10, 0, 1, 10, 20]);
  const candidates = hoverGuides(editor, editor.world.project([0, 0, 0]));
  assert.deepEqual(
    candidates.map((candidate) => candidate.point[0]),
    [-10, 10, -20],
  );
});
