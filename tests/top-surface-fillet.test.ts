import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { BodyEdgeFinish } from "../src/model/body.js";
import type { ExactBody } from "../src/model/exact-body.js";

const fixture: { bodies: ExactBody[]; operation: BodyEdgeFinish } = JSON.parse(
  readFileSync("tests/fixtures/top-surface-fillet.json", "utf8"),
);

test("captured fourteen-edge top fillet reuses exact bounds without changing mesh or completed geometry", async () => {
  const kernel = new SolidCalculator();
  try {
    const input = {
      ...fixture.operation,
      kind: "edge-finish" as const,
      size: 3,
      bodies: fixture.bodies,
    };
    const expected = await kernel.calculate(input);
    const visual = await kernel.calculate({ ...input, presentation: "deferred" });
    assert.deepEqual(visual.results[0].bounds, expected.results[0].bounds);
    assert.deepEqual(
      visual.results[0].faces,
      expected.results[0].faces.map((face) => face.vertices),
    );
    assert.ok(Math.abs(expected.results[0].volume - 947425.100051) < 0.001);
    assert.deepEqual(
      await kernel.calculate({ kind: "complete-preview", bodies: fixture.bodies }),
      expected,
    );
  } finally {
    kernel.close();
  }
});
