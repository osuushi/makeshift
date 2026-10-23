import assert from "node:assert/strict";
import test from "node:test";
import { NumericEdit, type NumericFields } from "../src/sketch/numeric-edit.js";

test("numeric composition requires live owners and propagates their completion", async () => {
  const numeric = new NumericEdit();
  assert.throws(() => numeric.commit(), /not connected/);
  assert.throws(() => numeric.duringDrag("width", 4), /not connected/);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: unknown[] = [];
  const fields: NumericFields = {
    commitFocused: () => pending,
    cancel: () => calls.push("cancel"),
    focus: (quantity, duplicate) => calls.push([quantity, duplicate]),
    activateTransform: async (axis) => {
      calls.push(axis);
      return true;
    },
    focusFirst: (initial) => calls.push(initial),
  };
  numeric.connect(fields, { editQuantity: (quantity, value) => calls.push([quantity, value]) });
  assert.throws(() => numeric.connect(fields, { editQuantity: () => {} }), /already connected/);
  let completed = false;
  const completion = numeric.commit().then(() => {
    completed = true;
  });
  await Promise.resolve();
  assert.equal(completed, false, "input transitions await the actual field edit");
  numeric.focus("translateX", true);
  numeric.duringDrag("width", 15);
  assert.deepEqual(calls, [
    ["translateX", true],
    ["width", 15],
  ]);
  release();
  await completion;
  assert.equal(completed, true);
  numeric.dispose();
  assert.throws(() => numeric.focus("radius"), /not connected/);
  assert.throws(() => numeric.duringDrag("radius", 8), /not connected/);
  assert.throws(() => numeric.connect(fields, { editQuantity: () => {} }), /disposed/);
  assert.equal(calls.length, 2, "disposed owners cannot receive another field or gesture edit");
});
