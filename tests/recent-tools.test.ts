import assert from "node:assert/strict";
import test from "node:test";
import type { SketchEditor } from "../src/sketch/editor.js";
import { ToolCatalog, type ToolDefinition } from "../src/tools/catalog.js";
import { searchTools } from "../src/tools/search.js";

function fixture() {
  const state = { isDragging: false, blocked: false, message: "", refresh() {} };
  return { state, catalog: new ToolCatalog(state as SketchEditor) };
}
function entry(id: string, extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return { id, label: id, category: "Sketch", reason: () => null, run: () => {}, ...extra };
}
const ids = (catalog: ToolCatalog) => catalog.recent().map((tool) => tool.id);

test("recent tools keep ten unique admitted invocations newest first without changing search", async () => {
  const { catalog } = fixture();
  for (let index = 0; index < 12; index++) catalog.register(entry(`tool${index}`));
  const ranking = searchTools(catalog.results(), "tool").map(({ tool }) => tool.id);
  for (let index = 0; index < 12; index++) await catalog.invoke(`tool${index}`);
  assert.deepEqual(
    ids(catalog),
    Array.from({ length: 10 }, (_, index) => `tool${11 - index}`),
  );
  await catalog.invoke("tool5");
  assert.deepEqual(ids(catalog), [
    "tool5",
    ...Array.from({ length: 10 }, (_, index) => `tool${11 - index}`).filter((id) => id !== "tool5"),
  ]);
  assert.deepEqual(
    searchTools(catalog.results(), "tool").map(({ tool }) => tool.id),
    ranking,
  );
});

test("unavailable recent tools retain their position and fresh reason, failed invocations do not promote", async () => {
  const { catalog, state } = fixture();
  let unavailable: string | null = null;
  catalog.register(entry("first", { reason: () => unavailable }));
  catalog.register(entry("second"));
  await catalog.invoke("first");
  await catalog.invoke("second");
  unavailable = "Select a closed profile";
  assert.equal(catalog.recent()[1].unavailable, unavailable);
  await catalog.invoke("first");
  assert.deepEqual(ids(catalog), ["second", "first"]);
  assert.equal(state.message, unavailable);
  state.isDragging = true;
  await catalog.invoke("first");
  assert.equal(state.message, "Finish the current drag first");
  state.isDragging = false;
  state.blocked = true;
  await catalog.invoke("first");
  assert.equal(state.message, "Wait for the current calculation");
  assert.deepEqual(ids(catalog), ["second", "first"]);
});

test("throws and explicit async switch refusal do not enter recents", async () => {
  const { catalog, state } = fixture();
  catalog.register(
    entry("throw", {
      run: () => {
        throw new Error("Invalid pending edit");
      },
    }),
  );
  catalog.register(entry("refuse", { run: async () => false }));
  await catalog.invoke("throw");
  assert.equal(state.message, "Invalid pending edit");
  await catalog.invoke("refuse");
  assert.deepEqual(ids(catalog), []);
});

test("only settled explicit visible invocations promote, and repeat activation stays guarded", async () => {
  const { catalog, state } = fixture();
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  catalog.register(
    entry("pending", {
      run: () => {
        calls++;
        return pending;
      },
    }),
  );
  catalog.register(entry("hidden", { showInTools: false }));
  const invocation = catalog.invoke("pending");
  assert.deepEqual(ids(catalog), []);
  await catalog.invoke("pending");
  assert.equal(calls, 1);
  assert.equal(state.message, "Switching tools…");
  finish();
  await invocation;
  await catalog.invoke("hidden");
  await catalog.invoke("missing");
  assert.deepEqual(ids(catalog), ["pending"]);
});

test("disposal and hidden entries are pruned, re-registration and other windows start fresh", async () => {
  const { catalog } = fixture();
  const tool = entry("visible");
  const dispose = catalog.register(tool);
  await catalog.invoke(tool.id);
  tool.showInTools = false;
  assert.deepEqual(ids(catalog), []);
  tool.showInTools = true;
  assert.deepEqual(ids(catalog), []);
  await catalog.invoke(tool.id);
  dispose();
  catalog.register(entry(tool.id));
  assert.deepEqual(ids(catalog), []);
  const other = fixture().catalog;
  other.register(entry(tool.id));
  assert.deepEqual(ids(other), []);
});

test("a callback disposed while settling cannot promote its replacement", async () => {
  const { catalog } = fixture();
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const dispose = catalog.register(entry("pending", { run: () => pending }));
  const invocation = catalog.invoke("pending");
  dispose();
  catalog.register(entry("pending"));
  finish();
  await invocation;
  assert.deepEqual(ids(catalog), []);
});
