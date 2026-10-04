import assert from "node:assert/strict";
import test from "node:test";
import { DocumentStore } from "../src/backend/document-store.js";
import { emptySketch, type SketchDocument } from "../src/sketch/document.js";
import { emptySelection, type HistorySelection } from "../src/sketch/history-selection.js";
import { describeOperation } from "../src/sketch/operation-history.js";
import { planes } from "../src/sketch/planes.js";
import { reopenOperation } from "../src/sketch/reopen-operation.js";

const document = (id: string): SketchDocument => ({
  units: "mm",
  sketches: [{ ...emptySketch(planes.XY), id }],
});
const selection = (...ids: string[]): HistorySelection => ({
  ...emptySelection(),
  modeling: ids.map((body) => ({ kind: "body", body })),
});
const extrusion = {
  sources: [{ face: "face-a" }],
  distance: 7,
  symmetric: true,
  draft: { mode: "offset" as const, value: 2 },
  twist: { angle: 20, origin: [1, 2, 3] as [number, number, number] },
  mode: "union" as const,
  targets: ["b", "a"],
  eligibleTargets: ["a", "b"],
};
const extrude = { kind: "extrude" as const, parameters: { extrusion, cleanup: true } };
const boolean = describeOperation({
  kind: "boolean-bodies",
  operation: { ids: ["b", "a"], mode: "subtract", keepOriginals: false },
});

for (const operation of [extrude, boolean]) {
  test(`${operation.kind} restores its exact input snapshot and ordered selection, retaining ordinary Redo`, () => {
    const before = document("before"),
      after = document("after"),
      store = new DocumentStore(before);
    const input = selection("b", "a"),
      result = selection("result");
    store.selections({ baseline: input, steps: [] });
    store.accept(after, operation);
    store.selections({ baseline: result, steps: [selection("other")] });
    const camera = {
      position: [1, 2, 3] as [number, number, number],
      target: [0, 0, 0] as [number, number, number],
      up: [0, 0, 1] as [number, number, number],
      height: 50,
    };
    store.selections({
      baseline: selection("other"),
      steps: [
        {
          navigation: {
            before: { camera, selection: selection("other") },
            after: { camera: { ...camera, height: 20 }, selection: selection("other") },
          },
        },
      ],
    });
    assert.deepEqual(store.reopenOperation, reopenOperation(operation));
    store.reopen();
    assert.equal(store.data, before);
    assert.deepEqual(store.selection, input);
    assert.deepEqual(store.restoredOperation, operation);
    assert.equal(store.restoredNavigation, undefined);
    assert.equal(store.canRedo, true);
    assert.equal(
      store.history.some((entry) => entry.operation.kind === "navigation"),
      false,
    );
    assert.equal(
      store.history.find((entry) => entry.operation.kind === "selection")?.state,
      "superseded",
    );
    store.record(operation, "cancelled");
    store.redo();
    assert.equal(store.data, after);
    assert.deepEqual(store.selection, result);
    assert.equal(store.canRedo, false);
    assert.ok(!JSON.stringify(store.data).includes("cleanup"));
    assert.ok(!JSON.stringify(store.data).includes("reopen"));
  });
}

test("failed, cancelled and no-op attempts preserve copied parameters and cleanup intent", () => {
  const store = new DocumentStore(document("before")),
    after = document("after");
  store.accept(after, extrude);
  store.record(boolean, "failed", "Invalid Boolean");
  store.record(boolean, "cancelled");
  store.accept(after, boolean);
  const intent = store.reopenOperation;
  assert.ok(intent && intent.request.kind === "extrude");
  assert.equal(intent.cleanup, true);
  assert.deepEqual(intent.request.extrusion, extrusion);
  intent.request.extrusion.targets?.reverse();
  intent.request.extrusion.distance = 999;
  intent.cleanup = false;
  assert.deepEqual(store.reopenOperation, reopenOperation(extrude));
});

test("a newer unsupported changed edit blocks reopening without skipping or mutating", () => {
  const store = new DocumentStore(document("before"));
  store.accept(document("extruded"), extrude);
  store.accept(document("edited"), { kind: "edit", parameters: {} });
  const before = store.data,
    history = store.history;
  assert.equal(store.reopenOperation, undefined);
  assert.throws(() => store.reopen(), /latest accepted edit cannot be reopened/);
  assert.equal(store.data, before);
  assert.deepEqual(store.history, history);
  assert.equal(store.canRedo, false);
  store.undo();
  assert.deepEqual(store.reopenOperation, reopenOperation(extrude));
});

test("accepting the reopened alternative branches with grouped Undo and Redo", () => {
  const before = document("before"),
    after = document("after"),
    alternative = document("alternative");
  const store = new DocumentStore(before);
  store.accept(after, extrude);
  store.reopen();
  store.accept(alternative, boolean);
  assert.equal(store.canRedo, false);
  assert.equal(store.history[0].state, "superseded");
  store.undo();
  assert.equal(store.data, before);
  store.redo();
  assert.equal(store.data, alternative);
});

test("fresh/replaced owners and incomplete diagnostic intents cannot reopen", () => {
  for (const store of [new DocumentStore(), new DocumentStore(document("opened"))]) {
    assert.equal(store.reopenOperation, undefined);
    assert.throws(() => store.reopen(), /latest accepted edit cannot be reopened/);
    assert.equal(store.canUndo, false);
    assert.equal(store.canRedo, false);
  }
  assert.equal(reopenOperation({ kind: "extrude", parameters: {} }), undefined);
  assert.equal(reopenOperation({ kind: "boolean-bodies", parameters: {} }), undefined);
  assert.equal(
    reopenOperation({ kind: "reconstruct-mesh", parameters: { vertices: 12 } }),
    undefined,
  );
});

test("latest API-only cleanup combinations fail before rollback without skipping older eligible geometry", () => {
  const unsupported = [
    "shell",
    "erode",
    "scale",
    "mirror",
    "plane-cut",
    "project",
    "move-faces",
    "move-edges",
    "cleanup",
    "transform-bodies",
    "construction-plane",
  ] as const;
  for (const kind of unsupported) {
    const before = document("before"),
      after = document("api-result"),
      store = new DocumentStore(before);
    store.accept(document("extruded"), extrude);
    const operation = {
      kind,
      parameters: {
        cleanup: true,
        operation: { selection: [{ body: "a", faces: [] }], thickness: -1 },
        projection: {},
        selection: [],
        transform: {},
        plane: {},
      },
    };
    store.accept(after, operation);
    const history = store.history;
    assert.equal(store.reopenOperation, undefined, `${kind} cannot silently discard cleanup`);
    assert.throws(() => store.reopen(), /latest accepted edit cannot be reopened/);
    assert.equal(store.data, after);
    assert.deepEqual(store.history, history);
    assert.equal(store.canRedo, false);
    store.undo();
    assert.deepEqual(store.reopenOperation, reopenOperation(extrude));
  }
  for (const kind of [
    "extrude",
    "revolve",
    "loft",
    "boolean-bodies",
    "finish-edges",
    "offset-faces",
  ] as const)
    assert.equal(
      reopenOperation({
        kind,
        parameters: { cleanup: true, extrusion: {}, revolution: {}, operation: {} },
      })?.cleanup,
      true,
    );
});
