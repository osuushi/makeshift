import assert from "node:assert/strict";
import test from "node:test";
import { documentFailure } from "../src/backend/document-failure.js";
import { EdgeSizeLimit } from "../src/backend/edge-size-limit.js";
import { FaceOffsetEdit } from "../src/backend/face-offset-edit.js";
import { CalculationFailure, calculationFailure } from "../src/model/calculation-failure.js";
import type { SketchDocument } from "../src/sketch/document.js";

const document: SketchDocument = {
  units: "mm",
  sketches: [],
  // Search uses only bounds to seed its probes; geometry is supplied by the controlled calculator.
  bodies: [{ id: "body", bounds: [0, 0, 0, 10, 10, 10] } as import("../src/model/body.js").Body],
};

for (const tool of ["offset", "finish"] as const) {
  test(`${tool}: feasibility search depends on category, never diagnostic wording`, async () => {
    for (const failure of [
      new Error("Kernel produced invalid geometry; Edge finish is not feasible at this size"),
      ...(
        [
          "cancelled",
          "superseded",
          "timeout",
          "internal",
          "invalid-request",
          "unsupported-input",
        ] as const
      ).map(
        (code) =>
          new CalculationFailure(code, "Those faces cannot be offset; not feasible at this size"),
      ),
    ]) {
      let calls = 0;
      const calculate = async () => {
        calls++;
        throw failure;
      };
      const work =
        tool === "offset"
          ? new FaceOffsetEdit().prepare(document, { faces: [], distance: 5 }, calculate)
          : new EdgeSizeLimit().calculate(
              document,
              { edges: [{ body: "body", edge: "edge" }], mode: "fillet", size: 5 },
              calculate,
            );
      await assert.rejects(work, (error) => error === failure);
      assert.equal(calls, 1);
    }
    let calls = 0;
    const calculate = async (
      value: number,
    ): Promise<import("../src/backend/kernel-reply.js").DeferredKernelReply> => {
      calls++;
      if (value > 1) throw new CalculationFailure("geometric-infeasibility", "Changed diagnostic");
      return { presentation: "deferred", mode: "new", participants: [], results: [], tools: [] };
    };
    if (tool === "offset") {
      const result = await new FaceOffsetEdit().prepare(
        document,
        { faces: [], distance: 5 },
        calculate,
      );
      assert.ok(result.distance > 0 && result.distance <= 1);
    } else {
      const result = await new EdgeSizeLimit<
        import("../src/backend/kernel-reply.js").DeferredKernelReply
      >().calculate(
        document,
        { edges: [{ body: "body", edge: "edge" }], mode: "fillet", size: 5 },
        calculate,
      );
      assert.ok(result.size > 0 && result.size <= 1);
    }
    assert.ok(calls > 1);
  });
}

test("unknown native codes fail closed and supersession is independent of wording", () => {
  assert.equal(
    calculationFailure({ error: "not feasible at this size", code: "future-code" }, "failed").code,
    "internal",
  );
  assert.equal(
    documentFailure(new Error("Preview superseded"), { kind: "read" }, false, false).outcome,
    "failed",
  );
  for (const code of ["superseded", "cancelled"] as const)
    assert.equal(
      documentFailure(
        new CalculationFailure(code, "Changed diagnostic"),
        { kind: "read" },
        false,
        false,
      ).outcome,
      "cancelled",
    );
});

test("invalid geometry from outside finish construction does not trigger finish size search", async () => {
  const failure = new CalculationFailure("invalid-geometry", "Changed validation diagnostic");
  let calls = 0;
  await assert.rejects(
    new EdgeSizeLimit().calculate(
      document,
      { edges: [{ body: "body", edge: "edge" }], mode: "fillet", size: 5 },
      async () => {
        calls++;
        throw failure;
      },
    ),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
  const result = await new FaceOffsetEdit().prepare(
    document,
    { faces: [], distance: 5 },
    async () => {
      calls++;
      throw failure;
    },
  );
  assert.equal(result.distance, 0, "Offset retains its existing verified no-op fallback");
  assert.ok(calls > 2);
});
