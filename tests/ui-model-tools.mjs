import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { close, inspect } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { chooseTool } from "./ui-tools.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
async function refine(page, name) {
  const ids = {
    "Add faces touching selected edges": "add-faces",
    "Remove edges": "remove-edges",
    "Add edges of selected faces": "add-edges",
    "Only edges": "only-edges",
    "Remove faces": "remove-faces",
    "Only faces": "only-faces",
    "Select owning bodies": "bodies",
    "Clear selection": "clear",
  };
  assert.ok(ids[name]);
  await chooseTool(page, name, `selection-${ids[name]}`);
  return inspect(page);
}
async function exclusive(page, tool) {
  const state = await inspect(page);
  assert.equal(state.modelingTool, tool);
  for (const [kind, selector] of [
    ["extrude", ".extrude-arrow"],
    ["offset", ".face-offset-widget .axial-panel"],
    ["move", ".body-gizmo .body-translate-handle[data-axis=X]"],
    ["fillet", ".body-edge-finish-widget .edge-finish-panel"],
  ]) {
    assert.equal(
      (await page.locator(`${selector}:visible`).count()) > 0,
      kind === tool || (kind === "fillet" && tool === "chamfer"),
      `${selector} visibility for ${tool}`,
    );
  }
}
export async function modelToolsRoute(page, name) {
  const { center, top } = await plate(page);
  const original = (await inspect(page)).document;
  await exclusive(page, "fillet");
  await menuKeyboardRoute(page, name);
  assert.equal(await button(page, "Chamfer edges").isVisible(), false);
  await button(page, "Switch to chamfer").click();
  await exclusive(page, "chamfer");
  await button(page, "Chamfer edges").click();
  await page.getByRole("textbox", { name: "Chamfer distance", exact: true }).fill("1");
  let state = await inspect(page);
  assert.ok(state.preview.bodies[0].volume < original.bodies[0].volume);
  const chamferVolume = state.preview.bodies[0].volume;
  await button(page, "Switch to fillet").click();
  state = await inspect(page);
  assert.notEqual(state.preview.bodies[0].volume, chamferVolume);
  assert.deepEqual(state.document, original);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Shift+F");
  await exclusive(page, "chamfer");
  await page.keyboard.press("f");
  await exclusive(page, "fillet");
  await selectionRefinementRoute(page, original);
  // No M activation needed: selection immediately exposes the actual move gizmo.
  await button(page, "Move body X").click();
  await page.getByRole("textbox", { name: "Body translation X", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].center[0], original.bodies[0].center[0] + 3);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await faceToolSwitchRoute(page, center);
  await page.mouse.click(top.x, top.y);
  await exclusive(page, "fillet");
  await page.screenshot({ path: `.cache/sketch-review/${name}-model-tools.png` });
  console.log(
    `${name}: default tools, exclusive handles, mode switch, topology refinement, keyboard/toolbar transitions, move/offset/extrude and Undo/Redo passed`,
  );
}

async function selectionRefinementRoute(page, original) {
  const edges = (await inspect(page)).modelingSelection;
  let state = await refine(page, "Add faces touching selected edges");
  assert.equal(state.modelingTool, null);
  assert.deepEqual(state.modelingSelection.slice(0, edges.length), edges);
  const expectedFaces = new Set(
    original.bodies[0].faces
      .filter((f) => edges.some((e) => f.edges.includes(e.edge)))
      .map((f) => f.id),
  );
  assert.deepEqual(
    new Set(state.modelingSelection.filter((t) => t.kind === "face").map((t) => t.face)),
    expectedFaces,
  );
  await exclusive(page, null);
  state = await refine(page, "Remove edges");
  assert.equal(state.modelingSelection.length, expectedFaces.size);
  await exclusive(page, "offset");
  state = await refine(page, "Add edges of selected faces");
  const expectedEdges = new Set(
    original.bodies[0].faces.filter((f) => expectedFaces.has(f.id)).flatMap((f) => f.edges),
  );
  assert.deepEqual(
    new Set(state.modelingSelection.filter((t) => t.kind === "edge").map((t) => t.edge)),
    expectedEdges,
  );
  await exclusive(page, null);
  await refine(page, "Only edges");
  await exclusive(page, "fillet");
  await refine(page, "Add faces touching selected edges");
  await refine(page, "Remove faces");
  await exclusive(page, "fillet");
  await refine(page, "Add faces touching selected edges");
  state = await refine(page, "Only faces");
  await exclusive(
    page,
    state.modelingSelection.length === original.bodies[0].faces.length ? "move" : "offset",
  );
  await refine(page, "Select owning bodies");
  await exclusive(page, "move");
}

async function faceToolSwitchRoute(page, center) {
  await refine(page, "Clear selection");
  await exclusive(page, null);
  await page.mouse.click(center.x, center.y);
  await exclusive(page, "offset");
  await page.keyboard.press("e");
  await exclusive(page, "extrude");
  await button(page, "Drag extrusion").click();
  const original = (await inspect(page)).document;
  // Invalid input cancels before the requested tool takes ownership.
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await distance.fill("bad");
  await chooseTool(page, "offset faces", "offset");
  assert.equal((await inspect(page)).interaction, null);
  assert.deepEqual((await inspect(page)).document, original);
  await exclusive(page, "offset");
  await page.keyboard.press("e");
  await button(page, "Drag extrusion").click();
  await distance.fill("0");
  // A zero-distance operation can exit without a history entry.
  await chooseTool(page, "offset faces", "offset");
  await exclusive(page, "offset");
  assert.deepEqual((await inspect(page)).document, original);
  await page.keyboard.press("Shift+R");
  assert.equal((await inspect(page)).interaction.kind, "revolve");
  await page.keyboard.press("o");
  await exclusive(page, "offset");
  await button(page, "Offset faces").click();
  await (await relativeOffsetInput(page)).fill("2");
  close((await inspect(page)).preview.bodies[0].volume, 4800);
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].volume, 4800);
  await page.keyboard.press("e");
  await exclusive(page, "extrude");
  await button(page, "Drag extrusion").click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("1");
  await inspect(page);
  await standaloneOnly(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("o");
  const state = await inspect(page);
  assert.equal(state.interaction, null);
  close(state.document.bodies[0].volume, 5200);
  await chooseTool(page, "undo", "undo");
  close((await inspect(page)).document.bodies[0].volume, 4800);
  await chooseTool(page, "redo", "redo");
  close((await inspect(page)).document.bodies[0].volume, 5200);
}

async function menuKeyboardRoute(page, name) {
  const selection = (await inspect(page)).modelingSelection;
  await button(page, "Tools").focus();
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "Find a tool" }).fill("clear selection");
  await page.screenshot({ path: `.cache/sketch-review/${name}-selection-menu.png` });
  assert.equal(
    await page.locator('[data-command="selection-clear"]').getAttribute("aria-selected"),
    "true",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).modelingSelection, selection);
  assert.equal(await button(page, "Tools").getAttribute("aria-expanded"), "false");
}
