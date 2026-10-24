import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { MeasurementTarget } from "../src/model/measurement.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

test("parallel distance uses supporting lines beyond trimmed overlap and excludes angled lines", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = {
      ...emptySketch(planes.YZ),
      curves: [
        { id: "base", a: { x: 0, y: 0 }, b: { x: 10, y: 0 } },
        { id: "disjoint", a: { x: 30, y: 5 }, b: { x: 20, y: 5 } },
        { id: "collinear", a: { x: 20, y: 0 }, b: { x: 30, y: 0 } },
        { id: "angled", a: { x: 20, y: 5 }, b: { x: 30, y: 6 } },
      ].map((curve) => ({ ...curve, kind: "segment" as const, construction: false })),
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    for (const [id, expected] of [
      ["disjoint", 5],
      ["collinear", 0],
      ["angled", undefined],
    ] as const) {
      const pair: MeasurementTarget[] = ["base", id].map((curve) => ({
        kind: "curve",
        sketch: sketch.id,
        curve,
      }));
      for (const targets of [pair, [...pair].reverse()]) {
        const reply = await owner.call({ kind: "measure", targets });
        assert.equal(reply.error, undefined);
        const result = reply.measurement;
        assert.ok(result);
        const distance = result.properties.find((p) => p.label === "Parallel distance");
        if (expected === undefined) assert.equal(distance, undefined);
        else {
          assert.ok(distance && Math.abs(distance.value - expected) < 1e-7);
          assert.equal(distance.unit, "mm");
          assert.equal(result.maximumGap, undefined);
          assert.ok(result.distance && result.distance.value > expected);
        }
      }
    }
  } finally {
    owner.close();
  }
});
