import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { at, close, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function history(page, redo = false) {
  await page.keyboard.press(redo ? "Meta+Shift+z" : "Meta+z");
  await settled(page);
}

async function rectangleExtrusion(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const pick = await at(page, 5, 3);
  const blank = await at(page, 30, 20);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  close((await inspect(page)).preview.bodies[0].volume, 3000);
  await page.keyboard.press("Enter");
  const accepted = await inspect(page);
  close(accepted.document.bodies[0].volume, 3000);
  assert.equal(accepted.interaction, null);
  return { pick, blank, accepted };
}

export async function selectionGeometryRedoRoute(page, name) {
  const { pick, blank, accepted } = await rectangleExtrusion(page);
  await history(page);
  const undone = await inspect(page);
  assert.equal(undone.document.bodies?.length ?? 0, 0);
  assert.ok(undone.modelingSelection.length, "Extrusion Undo restores its input selection");
  await page.mouse.click(blank.x, blank.y);
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  await chooseTool(page, "redo", "redo");
  const restored = await inspect(page);
  assert.deepEqual(restored.document, accepted.document);
  assert.deepEqual(restored.modelingSelection, accepted.modelingSelection);
  await history(page);
  assert.deepEqual((await inspect(page)).document, undone.document);
  await page.mouse.click(blank.x, blank.y);
  await page.mouse.click(pick.x, pick.y);
  const repicked = (await inspect(page)).modelingSelection;
  assert.ok(repicked.length);
  await history(page);
  assert.deepEqual((await inspect(page)).modelingSelection, []);
  await history(page, true);
  assert.deepEqual((await inspect(page)).document, undone.document);
  assert.deepEqual((await inspect(page)).modelingSelection, repicked);
  await history(page, true);
  assert.deepEqual((await inspect(page)).document, accepted.document);
  assert.deepEqual((await inspect(page)).modelingSelection, accepted.modelingSelection);
  await page.reload();
  assert.deepEqual((await inspect(page)).document, accepted.document);
  await history(page);
  assert.deepEqual((await inspect(page)).document, undone.document);
  await history(page, true);
  assert.deepEqual((await inspect(page)).document, accepted.document);
  await persistenceBoundary(page, name, accepted.document);
  console.log(
    `${name}: extrusion Undo > blank click > Redo, intervening selection navigation and reload/Open passed`,
  );
}

async function persistenceBoundary(page, name, accepted) {
  const path = resolve(`.cache/sketch-review/${name}-selection-redo.makeshift`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  assert.deepEqual((await inspect(page)).document.sketches, accepted.sketches);
  const reopened = await inspect(page);
  assert.equal(reopened.document.bodies.length, 1);
  close(reopened.document.bodies[0].volume, 3000);
  assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), []);
  await history(page);
  assert.deepEqual((await inspect(page)).document, reopened.document);
}
