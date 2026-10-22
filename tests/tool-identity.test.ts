import assert from "node:assert/strict";
import test from "node:test";
import { ActiveInteraction } from "../src/sketch/active-interaction.js";
import type { SketchEditor } from "../src/sketch/editor.js";
import { ToolCatalog } from "../src/tools/catalog.js";

test("primitive controller handoffs keep their parent identity without leaking into the next tool", () => {
  const interactions = new ActiveInteraction(() => {});
  const cube = interactions.acquire("cube", () => {});
  assert.ok(cube);
  cube.release();
  const extrude = interactions.continueTool(cube, () => {
    assert.equal(interactions.toolId, "cube", "refresh before child acquisition sees the parent");
    return interactions.acquire("extrude", () => {});
  });
  assert.ok(extrude);
  assert.equal(extrude.kind, "extrude");
  assert.equal(interactions.toolId, "cube");
  extrude.release();
  assert.equal(interactions.toolId, null);
  assert.throws(() =>
    interactions.continueTool(cube, () => {
      throw new Error("Failed start");
    }),
  );
  assert.equal(interactions.toolId, null);
  const standalone = interactions.acquire("extrude", () => {});
  assert.equal(standalone?.toolId, "extrude");
});

test("catalog remembers admitted explicit choices, including search results, independently of controller steps", async () => {
  const interactions = new ActiveInteraction(() => {});
  const editor = {
    interactions,
    blocked: false,
    isDragging: false,
    store: { scriptRunning: false, settled: async () => {} },
    refresh: () => {},
    message: "",
  };
  const catalog = new ToolCatalog(editor as unknown as SketchEditor);
  for (const id of ["cube", "extrude"]) {
    catalog.register({ id, label: id, category: "Solid", reason: () => null, run: () => {} });
  }
  const cube = catalog.results().find((tool) => tool.id === "cube");
  const extrude = catalog.results().find((tool) => tool.id === "extrude");
  assert.ok(cube && extrude);
  assert.equal(await catalog.activate(cube), true);
  const choice = catalog.lastChoice;
  assert.equal(choice?.id, "cube");
  const lease = interactions.acquire("extrude", () => {});
  lease?.release();
  assert.equal(catalog.lastChoice, choice, "internal steps do not count as choices");
  assert.equal(await catalog.activate({ ...extrude, run: () => false }), false);
  assert.equal(catalog.lastChoice, choice, "refused tools do not replace the chosen primitive");
  assert.equal(await catalog.activate(extrude), true);
  assert.equal(catalog.lastChoice?.id, "extrude");
  const explicit = catalog.lastChoice;
  await catalog.activate(extrude);
  assert.notEqual(
    catalog.lastChoice,
    explicit,
    "choosing the same tool again is an explicit choice",
  );
});
