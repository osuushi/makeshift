import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { DocumentStore } from "../src/backend/document-store.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { emptySelection, type HistorySelection } from "../src/sketch/history-selection.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { planes } from "../src/sketch/planes.js";

const document = (id: string): SketchDocument => ({
  units: "mm",
  sketches: [{ ...emptySketch(planes.XY), id }],
});
const selection = (id?: string): HistorySelection => ({
  ...emptySelection(),
  workspace: id ? { key: id, frame: planes.XY, sketchId: id } : null,
});
const operation = { kind: "edit" as const, parameters: {} };

function branch() {
  const before = document("before"),
    after = document("after");
  const store = new DocumentStore(before);
  store.selections({ baseline: selection("before"), steps: [] });
  store.accept(after, operation);
  store.selections({ baseline: selection("after"), steps: [] });
  store.undo();
  return { store, before, after };
}

test("deselection after geometry Undo retains Redo and cannot replay missing targets", () => {
  const { store, before, after } = branch();
  store.selections({ baseline: selection("before"), steps: [selection()] });
  assert.equal(store.canRedo, true);
  assert.equal(store.history[0].state, "undone");
  store.redo();
  assert.equal(store.data, after);
  assert.deepEqual(store.selection, selection("after"));
  assert.equal(store.history[1].state, "superseded");
  store.undo();
  assert.equal(store.data, before, "Intervening selection no longer shadows geometry Undo");
  assert.deepEqual(store.selection, selection("before"));
  store.redo();
  assert.equal(store.data, after);
  assert.deepEqual(store.selection, selection("after"));
});

test("multiple intervening picks navigate before retained geometry Redo", () => {
  const { store, before, after } = branch();
  store.selections({ baseline: selection("before"), steps: [selection(), selection("before")] });
  store.undo();
  assert.deepEqual(store.selection, selection());
  store.undo();
  assert.deepEqual(store.selection, selection("before"));
  store.redo();
  assert.equal(store.data, before);
  assert.deepEqual(store.selection, selection());
  store.redo();
  assert.equal(store.data, before);
  assert.deepEqual(store.selection, selection("before"));
  store.redo();
  assert.equal(store.data, after);
  assert.deepEqual(store.selection, selection("after"));
  assert.deepEqual(
    store.history.map((entry) => entry.state),
    ["applied", "superseded", "superseded"],
  );
  assert.deepEqual(
    store.history.map((entry) => entry.id),
    [1, 2, 3],
    "Diagnostics stay chronological",
  );
});

test("selection-only branching retires old picks while retaining every undone geometry edit", () => {
  const { store, before, after } = branch();
  store.redo();
  const later = document("later");
  store.accept(later);
  store.selections({ baseline: selection("later"), steps: [selection()] });
  store.undo();
  store.undo();
  store.undo();
  assert.equal(store.data, before);
  store.selections({ baseline: selection("before"), steps: [selection()] });
  assert.deepEqual(
    store.history.map((entry) => entry.state),
    ["undone", "undone", "superseded", "applied"],
  );
  store.redo();
  assert.equal(store.data, after);
  store.redo();
  assert.equal(store.data, later);
  assert.equal(store.canRedo, false);
});

test("noops, rejected validation, failed/cancelled attempts preserve geometry and selection Redo", () => {
  const { store, before, after } = branch();
  store.selections({ baseline: selection("before"), steps: [selection()] });
  store.undo();
  const history = store.history;
  store.selections({ baseline: selection("before"), steps: [selection("before")] });
  assert.deepEqual(store.history, history, "Unchanged selection preserves both redo paths");
  assert.equal(store.accept(before), false);
  assert.throws(() =>
    store.accept({ ...before, sketches: [before.sketches[0], before.sketches[0]] }),
  );
  store.record(operation, "failed", "Rejected");
  store.record(operation, "cancelled");
  store.redo();
  assert.equal(store.data, before);
  assert.deepEqual(store.selection, selection());
  store.redo();
  assert.equal(store.data, after);
});

test("new accepted geometry supersedes both redo paths and restores its actual input selection", () => {
  const { store, before } = branch();
  store.selections({ baseline: selection("before"), steps: [selection()] });
  const changed = document("changed");
  store.accept(changed);
  store.selections({ baseline: selection("changed"), steps: [] });
  assert.equal(store.canRedo, false);
  assert.deepEqual(
    store.history.map((entry) => entry.state),
    ["superseded", "superseded", "applied"],
  );
  store.undo();
  assert.equal(store.data, before);
  assert.deepEqual(store.selection, selection());
  store.redo();
  assert.equal(store.data, changed);
  assert.deepEqual(store.selection, selection("changed"));
});

test("Open/New reset transient selection history rather than persisting redo membership", async () => {
  const owner = new DocumentOwner();
  const call = async (request: ModelRequest) => {
    const reply = await owner.call(request);
    assert.equal(reply.error, undefined);
    return reply;
  };
  try {
    const before = document("before"),
      after = document("after");
    await call({ kind: "open", document: before });
    await call({ kind: "edit", sketch: after.sketches[0] });
    await call({ kind: "undo" });
    await call({
      kind: "selection",
      changes: { baseline: selection("before"), steps: [selection()] },
    });
    assert.equal(owner.view.canRedo, true);
    const saved = structuredClone(owner.view.data);
    assert.ok(!JSON.stringify(saved).includes("selectionDocument"));
    assert.ok(!JSON.stringify(saved).includes("history"));
    await call({ kind: "open", document: saved });
    assert.equal(owner.view.canRedo, false);
    assert.deepEqual((await call({ kind: "read-history" })).history, []);
    assert.deepEqual(owner.view.historySelection, emptySelection());
    await call({ kind: "new" });
    assert.deepEqual((await call({ kind: "read-history" })).history, []);
  } finally {
    owner.close();
  }
});
