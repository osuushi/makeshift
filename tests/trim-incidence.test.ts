import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { segment } from "../src/sketch/geometry.js";
import { movePoint } from "../src/sketch/line-edit.js";
import { planes } from "../src/sketch/planes.js";
import { trimOverlappingSketch, trimSketch } from "../src/sketch/trim-edit.js";
import { trimAt } from "../src/sketch/trim-geometry.js";

const captured: Sketch = JSON.parse(
  readFileSync("tests/fixtures/trim-attached-endpoint.json", "utf8"),
);

test("captured Trim replaces endpoint incidence with a junction that solves, moves and undoes", async () => {
  for (const trim of [trimSketch, trimOverlappingSketch]) {
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: captured })).error, undefined);
      const original = owner.view.data.sketches[0];
      const source = original.curves[2];
      const result = trim(original, trimAt(source, original.curves, { x: -1.5, y: 90 }));
      assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
      const accepted = owner.view.data.sketches[0];
      assert.equal(accepted.groups.length, 0);
      assert.equal(accepted.curves.length, original.curves.length);
      assert.deepEqual(accepted.curves[2], { ...source, b: { x: 0, y: 90 } });
      assert.deepEqual(
        accepted.curves.filter((c) => c.id !== source.id),
        original.curves.filter((c) => c.id !== source.id),
      );
      assert.ok(!accepted.constraints.some((c) => c.kind === "point-on-edge"));
      assert.deepEqual(
        result.removed.map((c) => c.id).sort(),
        original.constraints
          .filter((c) => !accepted.constraints.some((v) => v.id === c.id))
          .map((c) => c.id)
          .sort(),
      );
      const point = { curve: original.curves[5].id, end: "a" as const };
      const moved = movePoint(accepted, point, { x: 1, y: 90 });
      assert.equal((await owner.call({ kind: "edit", sketch: moved })).error, undefined);
      const afterMove = owner.view.data.sketches[0];
      assert.ok(afterMove.curves[2].kind === "segment" && afterMove.curves[5].kind === "segment");
      assert.deepEqual(afterMove.curves[2].b, { x: 1, y: 90 });
      assert.deepEqual(afterMove.curves[5].a, { x: 1, y: 90 });
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], accepted);
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data.sketches[0], original);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data.sketches[0], accepted);
    } finally {
      owner.close();
    }
  }
});

test("trim preserves interior and ambiguous point-on-edge attachments", async () => {
  for (const ambiguous of [false, true]) {
    const source = segment({ x: -10, y: 0 }, { x: 10, y: 0 });
    const cutter = segment({ x: 0, y: 0 }, { x: 0, y: 5 });
    const interior = segment({ x: -5, y: 0 }, { x: -5, y: 5 });
    const sketch: Sketch = {
      ...emptySketch(planes.XY),
      curves: [
        source,
        cutter,
        interior,
        ...(ambiguous ? [segment({ x: 0, y: 0 }, { x: 3, y: 5 })] : []),
      ],
      constraints: [
        {
          id: "cut",
          kind: "point-on-edge",
          point: { curve: cutter.id, end: "a" },
          edge: source.id,
        },
        {
          id: "interior",
          kind: "point-on-edge",
          point: { curve: interior.id, end: "a" },
          edge: source.id,
        },
      ],
    };
    const result = trimOverlappingSketch(sketch, trimAt(source, sketch.curves, { x: 5, y: 0 }));
    assert.equal(
      result.sketch.constraints.some((c) => c.id === "cut"),
      ambiguous,
    );
    assert.ok(result.sketch.constraints.some((c) => c.id === "interior"));
    const owner = new DocumentOwner();
    try {
      assert.equal((await owner.call({ kind: "edit", sketch: result.sketch })).error, undefined);
    } finally {
      owner.close();
    }
  }
});
