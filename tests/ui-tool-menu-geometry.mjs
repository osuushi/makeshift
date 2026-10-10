import assert from "node:assert/strict";
import { resolve } from "node:path";
import { exportDocument, openDocument, saveDocument } from "./native-documents.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { startScale } from "./ui-scale.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function show(page, query) {
  await page.keyboard.press("Meta+f");
  await page.getByRole("combobox", { name: "Find a tool" }).fill(query);
}
async function unchangedMenu(page) {
  const before = await inspect(page);
  await show(page, "shell");
  await page.keyboard.press("Escape");
  const after = await inspect(page);
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(after.preview, before.preview);
  assert.deepEqual(after.selectionTargets, before.selectionTargets);
  assert.deepEqual(after.modelingSelection, before.modelingSelection);
  assert.deepEqual(after.interaction, before.interaction);
}
async function sketchAndExtrude(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [-10, -10], [10, 10]);
  let state = await inspect(page);
  assert.equal(state.document.sketches[0].curves.length, 4);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  await width.fill("24");
  const before = await inspect(page);
  await unchangedMenu(page);
  assert.equal(await width.inputValue(), "24");
  assert.equal(await width.evaluate((e) => e === document.activeElement), true);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  assert.notDeepEqual(state.document, before.document);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before.document);
  await chooseTool(page, "select", "select");
  const edge = await at(page, -10, 3);
  await page.mouse.click(edge.x, edge.y);
  await chooseTool(page, "transform", "transform");
  assert.equal((await inspect(page)).moveMode, true);
  await startScale(page);
  await page.getByRole("textbox", { name: "Transform scale X" }).fill("1.2");
  await inspect(page);
  await unchangedMenu(page);
  await page.getByRole("button", { name: "Cancel transform scale", exact: true }).click();
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "extrude", "extrude");
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  const distance = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  await distance.fill("10");
  await inspect(page);
  await unchangedMenu(page);
  assert.equal(await distance.inputValue(), "10");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  state = await inspect(page);
  close(state.document.bodies[0].volume, 4000);
}
async function shellAndHistory(page) {
  let state;
  await worldClick(page, [4, 4, 10]);
  await show(page, "thickness");
  const rows = await page
    .locator('[role="option"]')
    .evaluateAll((els) =>
      els.map((e) => ({ id: e.dataset.command, disabled: e.getAttribute("aria-disabled") })),
    );
  assert.equal(rows[0].id, "shell");
  assert.equal(rows[0].disabled, "false");
  await page.keyboard.press("Enter");
  const thickness = page.getByRole("textbox", { name: "Shell thickness", exact: true });
  await thickness.fill("-1");
  state = await inspect(page);
  close(state.preview.bodies[0].volume, 1084);
  await unchangedMenu(page);
  await thickness.fill("-30");
  await inspect(page);
  await chooseTool(page, "transform", "transform");
  state = await inspect(page);
  assert.equal(state.interaction, null, "Invalid preview cancels before switching");
  close(state.document.bodies[0].volume, 4000);
  await chooseTool(page, "shell", "shell");
  await thickness.fill("-1");
  await inspect(page);
  await chooseTool(page, "transform", "transform");
  state = await inspect(page);
  assert.equal(state.modelingTool, "move");
  close(state.document.bodies[0].volume, 1084);
  const hollow = state.document;
  await chooseTool(page, "undo", "undo");
  close((await inspect(page)).document.bodies[0].volume, 4000);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, hollow);
  await page.keyboard.press("Escape");
}
async function filesAndDiscovery(page, name) {
  const path = resolve(`.cache/sketch-review/${name}-menu.makeshift`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 1);
  close((await inspect(page)).document.bodies[0].volume, 1084);
  for (const format of ["stl", "3mf"])
    await exportDocument(page, format, resolve(`.cache/sketch-review/${name}-menu.${format}`));
  await show(page, "nothingthatmatches");
  assert.equal(await page.locator('[role="option"]').count(), 0);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await show(page, "");
  await page.screenshot({ path: `.cache/sketch-review/${name}-tool-categories.png` });
  await page.keyboard.press("Escape");
}
export async function menuGeometryRoute(page, name) {
  await sketchAndExtrude(page);
  await shellAndHistory(page);
  await filesAndDiscovery(page, name);
  console.log(
    `${name}: menu sketch/edit/focus/scale/extrude/Shell/switch/history/save/open/export passed`,
  );
}
