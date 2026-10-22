import assert from "node:assert/strict";
import test from "node:test";
import { editDocument } from "../src/backend/document-edits.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { guidePosition } from "../src/guides/evaluate.js";
import { sketchFeature } from "../src/guides/geometry.js";
import { editGuides } from "../src/guides/model.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { mergeDocumentSketches } from "../src/sketch/sketch-merge.js";
import { trimOverlappingSketch } from "../src/sketch/trim-edit.js";

const line = {
  id: "line",
  kind: "segment" as const,
  a: { x: 0, y: 0 },
  b: { x: 20, y: 0 },
  construction: false,
};
const sketch = { ...emptySketch(planes.XY), curves: [line] };
function guides() {
  let document: SketchDocument = { units: "mm", sketches: [sketch] };
  for (const feature of ["start", "end", "midpoint"] as const)
    document = editGuides(document, {
      action: "create",
      anchor: { kind: "sketch-curve", sketch: sketch.id, curve: line.id, feature },
    });
  return document;
}

test("Trim preserves the far endpoint on its new fragment and deletes a removed endpoint", async () => {
  const owner = new DocumentOwner();
  try {
    const document = guides();
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const result = trimOverlappingSketch(sketch, { curve: line, start: 0.4, end: 0.6 });
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: result.sketch,
          intent: { kind: "direct", curveOrigins: result.curveOrigins },
        })
      ).error,
      undefined,
    );
    const saved = owner.view.data.guidePoints ?? [];
    assert.equal(saved.length, 3);
    const endpoint = saved[1];
    assert.ok(endpoint.anchor.kind === "sketch-curve");
    assert.notEqual(endpoint.anchor.curve, line.id);
    assert.deepEqual(guidePosition(owner.view.data, endpoint.anchor), [20, 0, 0]);
    assert.deepEqual(guidePosition(owner.view.data, saved[2].anchor), [4, 0, 0]);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.guidePoints, document.guidePoints);
    const removed = trimOverlappingSketch(sketch, { curve: line, start: 0.4, end: 1 });
    assert.equal(
      (
        await owner.call({
          kind: "edit",
          sketch: removed.sketch,
          intent: { kind: "direct", curveOrigins: removed.curveOrigins },
        })
      ).error,
      undefined,
    );
    assert.equal(owner.view.data.guidePoints?.length, 2);
    assert.ok(!owner.view.data.guidePoints?.some((p) => p.id === endpoint.id));
  } finally {
    owner.close();
  }
});

test("ordinary endpoint resizing follows that endpoint, independent of Trim provenance", async () => {
  const owner = new DocumentOwner();
  try {
    const document = guides();
    await owner.call({ kind: "open", document });
    const changed = { ...sketch, curves: [{ ...line, b: { x: 8, y: 0 } }] };
    assert.equal((await owner.call({ kind: "edit", sketch: changed })).error, undefined);
    const endpoint = owner.view.data.guidePoints?.[1];
    assert.ok(endpoint);
    assert.deepEqual(guidePosition(owner.view.data, endpoint.anchor), [8, 0, 0]);
  } finally {
    owner.close();
  }
});

test("whole sketch copies get independent guides and merging remaps colliding curve IDs", () => {
  const document = guides();
  const copy = editDocument(document, {
    kind: "place-sketch",
    sketchId: sketch.id,
    frame: { ...planes.XY, origin: [30, 0, 0] },
    duplicate: true,
  });
  assert.equal(copy.guidePoints?.length, 6);
  const point = copy.guidePoints?.[4];
  assert.ok(point);
  assert.notEqual(point.id, document.guidePoints?.[1].id);
  assert.deepEqual(guidePosition(copy, point.anchor), [50, 0, 0]);
  const other = { ...emptySketch(planes.XY), curves: [{ ...line, b: { x: 0, y: 8 } }] };
  const added = editGuides(
    { ...document, sketches: [...document.sketches, other] },
    {
      action: "create",
      anchor: { kind: "sketch-curve", sketch: other.id, curve: line.id, feature: "end" },
    },
  );
  const merged = mergeDocumentSketches(added, sketch.id, [other.id]);
  const moved = merged.guidePoints?.at(-1);
  assert.ok(moved?.anchor.kind === "sketch-curve");
  assert.equal(moved.anchor.sketch, sketch.id);
  assert.notEqual(moved.anchor.curve, line.id);
  assert.deepEqual(guidePosition(merged, moved.anchor), [0, 8, 0]);
});

test("cubic midpoint means half arc length rather than half of its parameter range", () => {
  const point = sketchFeature(
    {
      id: "cubic",
      kind: "bezier",
      construction: false,
      a: { x: 0, y: 0 },
      c1: { x: 0.1, y: 0 },
      c2: { x: 0.2, y: 0 },
      b: { x: 20, y: 0 },
    },
    "midpoint",
  );
  assert.ok(point);
  assert.ok(Math.abs(point.x - 10) < 1e-6);
  assert.equal(point.y, 0);
});

test("nonuniform scaling follows the arc's final endpoint and removes its lost circle center", async () => {
  const owner = new DocumentOwner();
  try {
    const arc = { ...line, kind: "arc" as const, bulge: 1 };
    const source = { ...sketch, curves: [arc] };
    let document: SketchDocument = { units: "mm", sketches: [source] };
    for (const feature of ["start", "end", "circle-center"] as const)
      document = editGuides(document, {
        action: "create",
        anchor: { kind: "sketch-curve", sketch: source.id, curve: arc.id, feature },
      });
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    assert.equal(
      (
        await owner.call({
          kind: "scale",
          operation: {
            kind: "curves",
            sketchId: source.id,
            ids: [arc.id],
            pivot: [0, 0, 0],
            factor: 1,
            factors: [2, 1, 1],
          },
        })
      ).error,
      undefined,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const points = owner.view.data.guidePoints ?? [];
    assert.equal(points.length, 2);
    assert.deepEqual(guidePosition(owner.view.data, points[0].anchor), [0, 0, 0]);
    assert.deepEqual(guidePosition(owner.view.data, points[1].anchor), [40, 0, 0]);
    assert.ok(points[1].anchor.kind === "sketch-curve");
    assert.notEqual(points[1].anchor.curve, arc.id);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data.guidePoints, document.guidePoints);
  } finally {
    owner.close();
  }
});
