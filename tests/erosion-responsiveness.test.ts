import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyErosion } from "../src/model/body.js";
import { calculationLabel, cancellableCalculation } from "../src/sketch/calculation-state.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/erosion-towers.json", "utf8")) as {
  document: SketchDocument;
  operation: BodyErosion;
};

test("captured original erosion allowance produces a result that can be reopened", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const result = await owner.call({
      kind: "erode",
      operation: { ...fixture.operation, method: "accurate" },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.view.candidate?.bodies?.length, 2);
    assert.equal(result.view.data, before);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
  } finally {
    owner.close();
  }
});

test("captured erosion cancels promptly, preserves history and restarts the native worker", async () => {
  assert.equal(cancellableCalculation("erode"), true);
  assert.equal(calculationLabel("erode"), "Calculating erosion");
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view;
    for (const kind of ["cancel-preview", "supersede-preview"] as const) {
      const pending = owner.call({
        kind: "erode",
        operation: { method: "accurate", ...fixture.operation, allowance: 0.1 },
      });
      await delay(150);
      const started = performance.now();
      assert.equal((await owner.call({ kind, interrupt: true })).error, undefined);
      const result = await pending;
      assert.ok(performance.now() - started < 2000, "Cancellation must not wait for coverage");
      assert.match(result.error ?? "", /cancelled|superseded/i);
      assert.equal(result.erosionAllowance, undefined);
      assert.equal(owner.view.candidate, null);
      assert.equal(owner.view.data, before.data);
      assert.equal(owner.view.canUndo, before.canUndo);
      assert.equal(owner.view.canRedo, before.canRedo);
      assert.equal(
        (await owner.call({ kind: "read-history" })).history?.at(-1)?.outcome,
        "cancelled",
      );
    }
    assert.equal((await owner.call({ kind: "open", document: before.data })).error, undefined);
  } finally {
    owner.close();
  }
});

test("captured tight allowance fails quickly and its suggested allowance succeeds", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const operation = { ...fixture.operation, allowance: 0.1 };
    const started = performance.now();
    const failed = await owner.call({
      kind: "erode",
      operation: { ...operation, method: "accurate" },
    });
    assert.ok(
      performance.now() - started < 15000,
      "Do not repeat the same eight-second coverage failure",
    );
    assert.ok(failed.error);
    assert.equal(failed.view.candidate, null);
    assert.equal(failed.view.data, before);
    const allowance = failed.erosionAllowance;
    assert.ok(allowance !== undefined && allowance > 0.1 && allowance <= 1);
    const retried = await owner.call({
      kind: "erode",
      operation: { method: "accurate", ...operation, allowance },
    });
    assert.equal(retried.error, undefined, `Suggested allowance ${allowance} must succeed`);
    assert.equal(retried.erosionAllowance, undefined);
    assert.equal(retried.view.candidate?.bodies?.length, 2);
    assert.equal(retried.view.data, before);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  } finally {
    owner.close();
  }
});
