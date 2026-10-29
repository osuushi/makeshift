import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { editGuides } from "../src/guides/model.js";
import { planeThroughGuides } from "../src/guides/selection.js";
import { withConstructionPlane } from "../src/model/construction-plane.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planeNormal, planes, validateFrame } from "../src/sketch/planes.js";

function fixture(): SketchDocument {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [
      [0, 0],
      [20, 0],
      [0, 30],
      [40, 0],
    ].map(([x, y], i) => ({
      id: `c${i}`,
      kind: "circle" as const,
      center: { x, y },
      radius: 2,
      construction: false,
    })),
  };
  let document: SketchDocument = { units: "mm", sketches: [sketch] };
  for (const curve of sketch.curves)
    document = editGuides(document, {
      action: "create",
      anchor: {
        kind: "sketch-curve",
        sketch: sketch.id,
        curve: curve.id,
        feature: "circle-center",
      },
    });
  return document;
}
test("three guide points create an orthonormal independent plane in selection order", () => {
  const document = fixture(),
    ids = document.guidePoints?.map((p) => p.id) ?? [];
  const frame = planeThroughGuides(document, ids.slice(0, 3));
  validateFrame(frame);
  assert.deepEqual(frame, planes.XY);
  const reversed = planeThroughGuides(document, [ids[0], ids[2], ids[1]]);
  assert.deepEqual(reversed.u, [0, 1, 0]);
  assert.ok(Math.hypot(reversed.v[0] - 1, reversed.v[1], reversed.v[2]) < 1e-7);
  assert.throws(() => planeThroughGuides(document, ids.slice(0, 2)), /three/);
  assert.throws(() => planeThroughGuides(document, [ids[0], ids[1], ids[3]]), /non-collinear/);
  assert.throws(() => planeThroughGuides(document, [ids[0], ids[0], ids[2]]), /distinct/);
  const store = new DocumentStore(document);
  store.accept(withConstructionPlane(document, { id: "plane", frame }));
  const withPlane = store.data;
  store.accept(editGuides(store.data, { action: "remove-many", ids: ids.slice(0, 3) }));
  assert.equal(store.data.guidePoints?.length, 1);
  assert.deepEqual(store.data.constructionPlanes?.[0].frame, frame);
  store.undo();
  assert.deepEqual(store.data, withPlane);
  store.undo();
  assert.deepEqual(store.data, document);
});

test("one guide centers the most camera-facing signed canonical plane", () => {
  const document = fixture();
  const id = document.guidePoints?.[1].id;
  assert.ok(id);
  for (const direction of [
    [1, 0.2, 0.3],
    [-1, 0.2, 0.3],
    [0.2, 1, 0.3],
    [0.2, -1, 0.3],
    [0.2, 0.3, 1],
    [0.2, 0.3, -1],
  ] as [number, number, number][]) {
    const frame = planeThroughGuides(document, [id], direction);
    validateFrame(frame);
    assert.deepEqual(frame.origin, [20, 0, 0]);
    const normal = planeNormal(frame);
    assert.equal(
      normal.reduce((sum, value, i) => sum + value * direction[i], 0),
      1,
    );
  }
  assert.throws(() => planeThroughGuides(document, ["missing"], [0, 0, 1]), /no longer/);
});
