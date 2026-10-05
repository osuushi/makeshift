import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { emptySketch } from "../src/sketch/document.js";
import type { HistoryNavigation } from "../src/sketch/history-navigation.js";
import { emptySelection, type HistorySelection } from "../src/sketch/history-selection.js";
import { planes } from "../src/sketch/planes.js";

const document = { units: "mm" as const, sketches: [emptySketch(planes.XY)] };
const pick = (...ids: string[]): HistorySelection => ({
  ...emptySelection(),
  modeling: ids.map((body) => ({ kind: "body", body })),
});
const view = (x: number, selection = pick()): HistoryNavigation => ({
  camera: { position: [x, -70, 65], target: [x, 0, 0], up: [0, 0, 1], height: 80 },
  selection,
});
function navigation(
  store: DocumentStore,
  before: HistoryNavigation,
  after: HistoryNavigation,
): void {
  store.selections({ baseline: before.selection, steps: [{ navigation: { before, after } }] });
}
const tips = (store: DocumentStore) =>
  store.history.filter(
    (entry) =>
      entry.operation.kind === "navigation" && ["applied", "undone"].includes(entry.state ?? ""),
  );

test("the full trailing view suffix navigates in order and expires when crossed", () => {
  const store = new DocumentStore();
  store.accept(document);
  const before = view(0, { ...pick("input"), workspace: { key: "XY", frame: planes.XY } });
  const middle = view(10);
  const after = view(20);
  navigation(store, before, middle);
  navigation(store, middle, after);
  assert.equal(tips(store).length, 2);
  store.undo();
  assert.deepEqual(store.restoredNavigation, middle);
  store.undo();
  assert.deepEqual(store.restoredNavigation, before);
  assert.deepEqual(store.data, document);
  assert.equal(tips(store).length, 2, "Undone entries remain eligible in the full history tail");
  store.redo();
  assert.deepEqual(store.restoredNavigation, middle);
  store.redo();
  assert.deepEqual(store.restoredNavigation, after);
  store.undo();
  store.undo();
  store.undo();
  assert.equal(store.data.sketches.length, 0);
  assert.equal(tips(store).length, 0, "Crossing into geometry removes the entire future suffix");
  assert.equal(store.restoredNavigation, undefined);
  store.redo();
  assert.deepEqual(store.data, document);
  assert.equal(store.canRedo, false);
});

test("new views after partial or full view Undo discard all former view states", () => {
  for (const count of [1, 2]) {
    const store = new DocumentStore(document);
    navigation(store, view(0), view(10));
    navigation(store, view(10), view(20));
    const oldIds = tips(store).map((entry) => entry.id);
    for (let i = 0; i < count; i++) store.undo();
    const baseline = count === 1 ? view(10) : view(0);
    navigation(store, baseline, view(30));
    assert.equal(tips(store).length, 1);
    assert.ok(store.history.every((entry) => !oldIds.includes(entry.id)));
    store.undo();
    assert.deepEqual(store.restoredNavigation, baseline);
    store.undo();
    assert.equal(tips(store).length, 0);
    assert.equal(store.canUndo, false);
    assert.equal(store.canRedo, false);
  }
});

test("Undoing an edit never exposes a view from before that edit", () => {
  const store = new DocumentStore();
  store.accept(document);
  navigation(store, view(0), view(10));
  navigation(store, view(10), view(20));
  const changed = { units: "mm" as const, sketches: [emptySketch(planes.XZ)] };
  store.accept(changed);
  store.undo();
  assert.deepEqual(store.data, document);
  store.undo();
  assert.equal(store.restoredNavigation, undefined);
  assert.equal(store.data.sketches.length, 0);
  assert.equal(tips(store).length, 0);
  navigation(store, view(20), view(30));
  store.undo();
  store.undo();
  assert.equal(tips(store).length, 0);
  store.redo();
  assert.deepEqual(store.data, document, "The old future views cannot preempt geometry Redo");
});

test("geometry Undo, view Undo/Redo and retained geometry Redo have coherent order", () => {
  const store = new DocumentStore();
  store.accept(document);
  store.selections({ baseline: pick("result"), steps: [] });
  store.undo();
  const undone = store.data;
  navigation(store, view(0), view(10));
  store.undo();
  assert.deepEqual(store.data, undone);
  assert.deepEqual(store.restoredNavigation, view(0));
  store.redo();
  assert.deepEqual(store.data, undone, "View Redo precedes older geometry Redo");
  assert.deepEqual(store.restoredNavigation, view(10));
  store.redo();
  assert.deepEqual(store.data, document);
  assert.deepEqual(store.selection, pick("result"));
  assert.equal(store.restoredOperation?.kind, "accept");
  assert.equal(tips(store).length, 0);
  assert.equal(store.canRedo, false);
});

test("selection-only changes expire either view tip state and preserve geometry Redo", () => {
  for (const undoView of [false, true]) {
    const store = new DocumentStore();
    store.accept(document);
    store.undo();
    navigation(store, view(0), view(10));
    if (undoView) store.undo();
    store.selections({ baseline: pick(), steps: [pick("other")] });
    assert.equal(tips(store).length, 0);
    assert.equal(store.canRedo, true);
    store.undo();
    assert.deepEqual(store.selection, pick());
    store.redo();
    assert.deepEqual(store.selection, pick("other"));
    assert.equal(store.data.sketches.length, 0);
    store.redo();
    assert.deepEqual(store.data, document);
    assert.deepEqual(store.selection, pick());
    assert.equal(store.canRedo, false);
  }
});

test("new accepted geometry expires view and geometry Redo; unchanged attempts preserve them", () => {
  const store = new DocumentStore();
  store.accept(document);
  store.undo();
  navigation(store, view(0), view(10));
  store.undo();
  const history = store.history;
  navigation(store, view(0), view(0));
  assert.deepEqual(store.history, history, "No-op view does not supersede its undone tip");
  store.record({ kind: "extrude", parameters: {} }, "failed", "invalid input");
  store.record({ kind: "extrude", parameters: {} }, "cancelled");
  store.accept(store.data);
  assert.equal(tips(store).length, 1);
  store.redo();
  assert.deepEqual(store.restoredNavigation, view(10));
  const changed = { units: "mm" as const, sketches: [emptySketch(planes.XZ)] };
  store.accept(changed);
  assert.equal(tips(store).length, 0);
  assert.equal(store.canRedo, false);
  store.undo();
  assert.equal(store.data.sketches.length, 0);
  assert.equal(store.canUndo, false);
});

test("transient navigation belongs to history rather than accepted or saved geometry", () => {
  const store = new DocumentStore(document);
  navigation(store, view(0), view(10));
  assert.equal(store.data, document);
  assert.deepEqual(JSON.parse(JSON.stringify(store.data)), document);
  const opened = new DocumentStore(structuredClone(store.data));
  assert.deepEqual(opened.history, []);
  assert.equal(opened.canUndo, false);
});
