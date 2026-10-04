import assert from "node:assert/strict";
import test from "node:test";
import { validateErosionQuality } from "../src/backend/kernel-erosion-validation.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";

const input: Extract<KernelRequest, { kind: "erode" }> = {
  kind: "erode",
  ids: ["source"],
  thickness: 1,
  bodies: [],
};
const report = {
  body: "source",
  spacing: 0.5,
  triangles: 100,
  faces: 6,
  samples: 50,
  sampledMinThickness: 0.9,
  sampledMaxThickness: 1.2,
  sampledFitDeviation: 0.2,
};
const result = { predecessorBodies: ["source"], faces: Array(6).fill({}) };
test("erosion diagnostics validate identity, counts and finite measurements without enforcing target thickness", () => {
  assert.doesNotThrow(() =>
    validateErosionQuality({ erosionQuality: [report], results: [result] }, input),
  );
  for (const invalid of [
    { body: "other" },
    { faces: 5 },
    { faces: 200 },
    { samples: 0 },
    { samples: NaN },
    { spacing: 0 },
    { sampledMinThickness: 2 },
    { sampledMaxThickness: Infinity },
    { sampledFitDeviation: -1 },
  ]) {
    assert.throws(
      () =>
        validateErosionQuality(
          { erosionQuality: [{ ...report, ...invalid }], results: [result] },
          input,
        ),
      /Invalid solid kernel reply/,
    );
  }
  assert.throws(() =>
    validateErosionQuality({ erosionQuality: [report, report], results: [result] }, input),
  );
  assert.throws(() => validateErosionQuality({ results: [result] }, input));
  assert.throws(() =>
    validateErosionQuality(
      { erosionQuality: [report], results: [result] },
      { ...input, method: "accurate" },
    ),
  );
  assert.doesNotThrow(() =>
    validateErosionQuality({ results: [result] }, { ...input, method: "accurate" }),
  );
});
