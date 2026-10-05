import assert from "node:assert/strict";
import test from "node:test";
import type { SketchEditor } from "../src/sketch/editor.js";
import { performHistory } from "../src/sketch/editor-history.js";
import { InteractionHistory } from "../src/sketch/interaction-history.js";
import { toolCatalog } from "../src/tools/catalog.js";
import { sketchTools } from "../src/tools/sketch-tools.js";

function editorAtBaseline() {
  let value = 0;
  let cancellations = 0;
  const requests: string[] = [];
  const history = new InteractionHistory(
    () => value,
    (saved) => {
      value = saved;
    },
  );
  const interaction = { history, captured: false, finish: async () => true };
  const editor = {
    interactions: {
      current: interaction as typeof interaction | null,
      cancel: async () => {
        cancellations++;
        editor.interactions.current = null;
      },
    },
    world: { active: false },
    blocked: false,
    isDragging: false,
    numeric: { cancel: () => {} },
    store: {
      canUndo: false,
      canRedo: false,
      settled: async () => {},
      request: async ({ kind }: { kind: string }) => {
        requests.push(kind);
      },
    },
    refresh: () => {},
    history: (direction: "undo" | "redo") =>
      performHistory(editor as unknown as SketchEditor, direction),
  };
  return {
    editor,
    interaction,
    history,
    requests,
    value: () => value,
    tweak: (next: number) => {
      value = next;
      history.checkpoint();
    },
    cancellations: () => cancellations,
  };
}

test("Undo at initial modal state cancels once; next Undo navigates the document", async () => {
  const context = editorAtBaseline();
  await context.editor.history("redo");
  assert.equal(context.cancellations(), 0, "Unavailable Redo never exits a modal tool");
  await context.editor.history("undo");
  assert.equal(context.cancellations(), 1);
  assert.equal(context.editor.interactions.current, null);
  assert.deepEqual(context.requests, [], "Exit never also undoes or accepts geometry");
  await context.editor.history("undo");
  assert.deepEqual(context.requests, ["undo"]);
});

test("numeric tweaks keep local Undo/Redo until Undo at the restored baseline exits", async () => {
  const context = editorAtBaseline();
  context.tweak(2);
  context.tweak(4);
  await context.editor.history("undo");
  assert.equal(context.value(), 2);
  await context.editor.history("undo");
  assert.equal(context.value(), 0);
  await context.editor.history("redo");
  assert.equal(context.value(), 2);
  context.tweak(3);
  assert.equal(context.history.canRedo, false, "New tweak keeps ordinary local branching");
  await context.editor.history("undo");
  await context.editor.history("undo");
  assert.equal(context.value(), 0);
  assert.equal(context.cancellations(), 0);
  await context.editor.history("undo");
  assert.equal(context.cancellations(), 1);
  assert.deepEqual(context.requests, []);
});

test("initial modal Undo remains unavailable while calculating or holding a pointer", async () => {
  const context = editorAtBaseline();
  context.editor.blocked = true;
  await context.editor.history("undo");
  context.editor.blocked = false;
  context.interaction.captured = true;
  await context.editor.history("undo");
  assert.equal(context.cancellations(), 0);
  assert.deepEqual(context.requests, []);
});

test("shared command catalog enables initial modal Undo but preserves busy/drag guards", async () => {
  const context = editorAtBaseline();
  const editor = context.editor as unknown as SketchEditor;
  const dispose = sketchTools(editor);
  const catalog = toolCatalog(editor);
  const reason = (id: string) => catalog.results().find((entry) => entry.id === id)?.unavailable;
  try {
    assert.equal(reason("undo"), null, "Boundary exit works without document Undo available");
    assert.equal(reason("redo"), "Nothing to redo");
    context.editor.blocked = true;
    await catalog.invoke("undo");
    assert.equal(reason("undo"), "Wait for the current calculation");
    context.editor.blocked = false;
    context.editor.isDragging = true;
    await catalog.invoke("undo");
    assert.equal(reason("undo"), "Finish the current drag first");
    assert.equal(context.cancellations(), 0);
    context.editor.isDragging = false;
    await catalog.invoke("undo");
    assert.equal(context.cancellations(), 1);
    assert.equal(reason("undo"), "Nothing to undo");
  } finally {
    dispose();
  }
});
