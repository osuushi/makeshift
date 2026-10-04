import assert from "node:assert/strict";
import test from "node:test";
import { InteractionHistory } from "../src/sketch/interaction-history.js";

test("modal checkpoints coalesce a gesture, preserve redo, branch and stop at the baseline", async () => {
  let value = { distance: 0, targets: ["a"] };
  const history = new InteractionHistory(
    () => value,
    (saved) => {
      value = saved;
    },
  );
  value.distance = 1;
  value.distance = 2;
  history.checkpoint();
  value.distance = 3;
  history.checkpoint();
  await history.navigate("undo");
  assert.equal(value.distance, 2);
  history.checkpoint(); // Unchanged blur does not discard Redo.
  assert.equal(history.canRedo, true);
  await history.navigate("undo");
  assert.equal(value.distance, 0);
  await history.navigate("undo");
  assert.equal(value.distance, 0);
  await history.navigate("redo");
  assert.equal(value.distance, 2);
  value.targets.push("b");
  history.checkpoint();
  assert.equal(history.canRedo, false);
  await history.navigate("undo");
  assert.deepEqual(value.targets, ["a"]);
});

test("an unfinished field is one tweak and asynchronous restoration cannot reenter", async () => {
  let value = 0;
  let release = () => {};
  const history = new InteractionHistory(
    () => value,
    async (saved) => {
      value = saved;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  );
  value = 4;
  const undo = history.navigate("undo");
  assert.equal(value, 0);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, false);
  await history.navigate("undo");
  history.checkpoint();
  release();
  await undo;
  assert.equal(history.canRedo, true);
});

test("editor history stays inside its interaction and refuses navigation while busy", async () => {
  const { performHistory } = await import("../src/sketch/editor-history.js");
  let value = 0;
  const history = new InteractionHistory(
    () => value,
    (saved) => {
      value = saved;
    },
  );
  value = 3;
  history.checkpoint();
  let documentRequests = 0;
  const editor = {
    interactions: { current: { history, captured: false } },
    world: { navigation: { dragging: false } },
    blocked: true,
    store: {
      request: () => {
        documentRequests++;
      },
    },
    refresh: () => {},
  };
  const run = (direction: "undo" | "redo") =>
    performHistory(editor as unknown as import("../src/sketch/editor.js").SketchEditor, direction);
  await run("undo");
  assert.equal(value, 3);
  editor.blocked = false;
  await run("undo");
  assert.equal(value, 0);
  assert.equal(documentRequests, 0);
  await run("redo");
  assert.equal(value, 3);
  editor.interactions.current.captured = true;
  await run("undo");
  assert.equal(value, 3);
});

test("legacy preview owners cancel before document history without accepting their finisher", async () => {
  const { ActiveInteraction } = await import("../src/sketch/active-interaction.js");
  const { performHistory } = await import("../src/sketch/editor-history.js");
  for (const kind of ["projection", "fillet", "offset"] as const) {
    for (const direction of ["undo", "redo"] as const) {
      const events: string[] = [];
      const interactions = new ActiveInteraction(() => events.push("released"));
      const lease = interactions.acquire(
        kind,
        async () => {
          events.push("cancel");
          await Promise.resolve();
          lease?.release();
        },
        async () => {
          events.push("accept");
          return true;
        },
        {
          navigation: "when-released",
          documentHistory: "cancel-preview",
        },
      );
      const editor = {
        interactions,
        blocked: false,
        get isDragging() {
          return interactions.dragging;
        },
        numeric: { cancel: () => events.push("numeric-cancel") },
        store: {
          settled: async () => {
            events.push("settled");
          },
          request: async ({ kind }: { kind: string }) => {
            events.push(kind);
          },
        },
        refresh: () => events.push("refresh"),
      };
      await performHistory(
        editor as unknown as import("../src/sketch/editor.js").SketchEditor,
        direction,
      );
      assert.equal(interactions.current, null);
      assert.deepEqual(events, [
        "numeric-cancel",
        "cancel",
        "released",
        "settled",
        direction,
        "refresh",
      ]);
    }
  }
});
