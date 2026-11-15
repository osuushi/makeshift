import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { cubicOffsetProfile } from "../src/sketch/cubic-offset-target.js";
import { closestOnCurve, displayPoints } from "../src/sketch/curve-geometry.js";
import type { Sketch } from "../src/sketch/document.js";
import { hasClosedEndpoints } from "../src/sketch/loop-boundary.js";
import { distance } from "../src/sketch/point-math.js";

const sketch: Sketch = JSON.parse(readFileSync("tests/fixtures/offset-lobed-section.json", "utf8"));

test("captured lobed cubic loop erodes at the requested distance and accepts in one Undo", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const before = owner.view.data;
    let previousArea = cubicOffsetProfile(sketch.curves).area;
    for (const amount of [-0.2, -1, -1.5, -2, -3]) {
      const reply = await owner.call({
        kind: "offset-sketch",
        sketchId: sketch.id,
        curves: sketch.curves.map((c) => c.id),
        amount,
      });
      assert.equal(reply.error, undefined, `offset ${amount}`);
      assert.deepEqual(owner.view.data, before);
      const candidate = reply.view.candidate?.sketches[0];
      assert.ok(candidate);
      const added = candidate.curves.slice(sketch.curves.length);
      assert.deepEqual(candidate.curves.slice(0, sketch.curves.length), sketch.curves);
      assert.deepEqual(
        candidate.constraints.slice(0, sketch.constraints.length),
        sketch.constraints,
      );
      assert.ok(hasClosedEndpoints(added));
      const area = cubicOffsetProfile(added).area;
      assert.ok(area > 0 && area < previousArea);
      previousArea = area;
      for (const curve of added) {
        for (const p of displayPoints(curve, 0.01)) {
          const gap = Math.min(...sketch.curves.map((c) => distance(p, closestOnCurve(c, p))));
          assert.ok(Math.abs(gap + amount) < 0.0011, `offset ${amount}: boundary gap ${gap}`);
        }
      }
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      assert.equal((await owner.call({ kind: "undo" })).error, undefined);
      assert.deepEqual(owner.view.data, before);
      assert.equal((await owner.call({ kind: "redo" })).error, undefined);
      assert.deepEqual(owner.view.data.sketches[0], candidate);
      await owner.call({ kind: "undo" });
    }
    const operation = (amount: number) => ({
      kind: "offset-sketch" as const,
      sketchId: sketch.id,
      curves: sketch.curves.map((c) => c.id),
      amount,
    });
    assert.ok((await owner.call(operation(-30))).error, "A wholly eroded loop still rejects");
    assert.equal(owner.view.candidate, null);
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call(operation(1))).error, undefined, "Outward offset recovers");
    await owner.call({ kind: "cancel-preview" });
    assert.equal(owner.view.candidate, null);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
