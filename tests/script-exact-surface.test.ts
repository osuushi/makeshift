import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { KernelRequest } from "../src/backend/kernel-request.js";
import type { SolidCalculator } from "../src/backend/solid-calculator.js";
import { surfaceFixture, withValue } from "./surface-preview-fixtures.js";

for (const kind of ["offset", "fillet", "chamfer"] as const) {
  test(`${kind}: script rejects the exact impossible request without feasibility probes or accepted edits`, async (context) => {
    const owner = new DocumentOwner();
    try {
      const { request } = await surfaceFixture(owner, kind);
      const before = owner.view.data;
      const history = { undo: owner.view.canUndo, redo: owner.view.canRedo };
      const kernel = Reflect.get(owner, "kernel") as SolidCalculator;
      const calculate = kernel.calculate.bind(kernel);
      let calls = 0;
      context.mock.method(kernel, "calculate", (input: KernelRequest) => {
        calls++;
        return calculate(input);
      });
      owner.beginScript("exact.ts");
      const overshoot = withValue(request, kind === "offset" ? -100 : 100);
      await assert.rejects(
        owner.scripts.step(
          overshoot.kind === "offset-faces"
            ? { kind: "offsetFaces", input: overshoot.operation }
            : { kind: "finishEdges", input: overshoot.operation },
        ),
      );
      assert.equal(calls, 1, "Only the exact requested size reaches the kernel");
      await owner.scripts.cancel("Exact request rejected");
      assert.equal(owner.view.data, before);
      assert.deepEqual({ undo: owner.view.canUndo, redo: owner.view.canRedo }, history);
    } finally {
      owner.close();
    }
  });
}

test("a positive scripted subminimum blend radius rejects; explicit zero recovers the sharp solid", async () => {
  const owner = new DocumentOwner();
  try {
    const { body, request } = await surfaceFixture(owner, "fillet");
    assert.equal((await owner.call(request)).error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const before = owner.view.data;
    const rounded = before.bodies?.[0];
    const blend = rounded?.faces.find((face) => face.blend);
    assert.ok(rounded && blend);
    const input = { faces: [{ body: rounded.id, face: blend.id }], distance: 0, radius: 0.0006 };
    owner.beginScript("too-small.ts");
    await assert.rejects(owner.scripts.step({ kind: "offsetFaces", input }), /zero or at least/);
    await owner.scripts.cancel("Unsupported radius");
    assert.equal(owner.view.data, before);
    owner.beginScript("sharp.ts");
    await owner.scripts.step({ kind: "offsetFaces", input: { ...input, radius: 0 } });
    assert.ok(owner.scripts.finish());
    const sharp = owner.view.data.bodies?.[0];
    assert.ok(sharp && Math.abs(sharp.volume - body.volume) < 1e-6);
    assert.ok(!sharp.faces.some((face) => face.blend));
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
  } finally {
    owner.close();
  }
});
