import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { DecoratorSession } from "../src/backend/decorator-session.js";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import { finish, prism, square, vertical } from "./body-edge-fixtures.js";

test("reopening reuses exact accepted geometry and measurements without kernel calls", async () => {
  const owner = new DocumentOwner();
  const calculate = mock.method(SolidCalculator.prototype, "calculate");
  const decorators = mock.method(DecoratorSession.prototype, "continue");
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    await finish(owner, body, [vertical(body, 0, 0)], 2);
    const measurements = { edgeSize: owner.view.edgeSize, edgeSelection: owner.view.edgeSelection };
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    const calls = calculate.mock.callCount();
    const continuations = decorators.mock.callCount();
    const restored = await owner.call({ kind: "reopen" });
    assert.equal(restored.error, undefined);
    assert.equal(restored.view.data, before);
    assert.equal(restored.view.candidate, accepted);
    assert.equal(restored.view.edgeSize, measurements.edgeSize);
    assert.deepEqual(restored.view.edgeSelection, measurements.edgeSelection);
    await owner.call({ kind: "read" });
    await owner.call({ kind: "check-cleanup" });
    assert.equal(calculate.mock.callCount(), calls);
    assert.equal(decorators.mock.callCount(), continuations);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal(owner.view.data, accepted);
    assert.equal(calculate.mock.callCount(), calls);
    assert.equal(decorators.mock.callCount(), continuations);
    await owner.call({ kind: "reopen" });
    assert.equal((await owner.call({ kind: "cancel-preview" })).error, undefined);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal(calculate.mock.callCount(), calls);
    assert.equal(decorators.mock.callCount(), continuations);
    await owner.call({ kind: "reopen" });
    assert.equal(
      (
        await owner.call({
          kind: "finish-edges",
          operation: {
            edges: [{ body: body.id, edge: vertical(body, 0, 0).id }],
            size: 1,
            mode: "fillet",
          },
        })
      ).error,
      undefined,
    );
    assert.ok(calculate.mock.callCount() > calls, "changed parameters calculate normally");
    assert.notDeepEqual(owner.view.candidate, accepted);
    await owner.call({ kind: "cancel-preview" });
    await owner.call({ kind: "redo" });
    const current = owner.view.data.bodies?.[0];
    assert.ok(current);
    await finish(owner, current, [vertical(current, 20, 20)], 1);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    const afterEdit = calculate.mock.callCount();
    const older = await owner.call({ kind: "reopen" });
    assert.equal(older.view.candidate, accepted);
    assert.equal(
      older.view.edgeSize,
      2,
      "history restores its own measurement, not the newer size",
    );
    assert.equal(calculate.mock.callCount(), afterEdit);
  } finally {
    calculate.mock.restore();
    decorators.mock.restore();
    owner.close();
  }
});

test("combined API cleanup cannot reopen and preserves exact accepted geometry without calculation", async () => {
  const owner = new DocumentOwner();
  const calculate = mock.method(SolidCalculator.prototype, "calculate");
  const decorators = mock.method(DecoratorSession.prototype, "continue");
  try {
    const body = await prism(owner, square);
    const before = owner.view.data;
    await finish(owner, body, [vertical(body, 0, 0)], 2);
    assert.equal((await owner.call({ kind: "accept", cleanup: true })).error, undefined);
    const accepted = owner.view.data;
    const calls = calculate.mock.callCount();
    const continuations = decorators.mock.callCount();
    const rejected = await owner.call({ kind: "reopen" });
    assert.equal(rejected.error, "The latest accepted edit cannot be reopened");
    assert.equal(rejected.view.data, accepted, "Ineligible Reopen cannot roll back the owner");
    assert.equal(rejected.view.candidate, null);
    assert.equal(calculate.mock.callCount(), calls);
    assert.equal(decorators.mock.callCount(), continuations);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "reopen" })).error, rejected.error);
    assert.equal(owner.view.data, accepted);
    assert.equal(calculate.mock.callCount(), calls);
    assert.equal(decorators.mock.callCount(), continuations);
  } finally {
    calculate.mock.restore();
    decorators.mock.restore();
    owner.close();
  }
});
