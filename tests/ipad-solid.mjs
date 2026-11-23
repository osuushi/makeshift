import assert from "node:assert/strict";
import { tabletBodySelection } from "./ipad-selection.mjs";
import { at, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function tabletSolidRoute(page, name) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await settled(page);
  const center = await at(page, 3, 3);
  const other = await at(page, -3, -3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const value = page.getByRole("textbox", { name: "Extrusion distance", exact: true });
  if (!(await value.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await value.fill("5");
  await settled(page);
  assert.ok((await inspect(page)).preview?.bodies.length);
  await value.press("Shift+Backquote");
  await settled(page);
  assert.equal((await inspect(page)).preview, null);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  // A distinct location is a fresh profile selection, not a double click on
  // the extrusion widget that appeared underneath the first click.
  await page.mouse.click(other.x, other.y);
  if (!(await value.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await value.fill("5");
  await settled(page);
  assert.ok((await inspect(page)).preview?.bodies.length);
  await value.press("Escape");
  await settled(page);
  assert.equal((await inspect(page)).preview, null, "Escape discards unfinished geometry");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await settled(page);
  const pick = await at(page, 3, 3);
  const edge = await at(page, -10, -4),
    bodyCenter = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  if (!(await value.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await value.fill("5");
  await value.press("Enter");
  await page.keyboard.press("Enter");
  await settled(page);
  let state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].volume - 2000) < 1e-6);
  await chooseTool(page, "undo", "undo");
  await settled(page);
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  await settled(page);
  state = await inspect(page);
  assert.ok(Math.abs(state.document.bodies[0].volume - 2000) < 1e-6);
  await tabletBodySelection(page, name, edge, bodyCenter);
  const download = page.waitForEvent("download");
  await chooseTool(page, "export 3mf", "export-3mf");
  const file = await download;
  assert.equal(await file.failure(), null);
  assert.match(file.suggestedFilename(), /\.3mf$/);
  console.log("extrusion, numeric tilde and Escape cancellation, history and export passed");
  return state.document;
}
