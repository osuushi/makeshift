import assert from "node:assert/strict";
import { at, close, drag, reset } from "./ui-helpers.mjs";
import {
  assertNavigation,
  navigationHistory,
  navigationIdle,
  navigationRoundTrip,
  navigationTips,
} from "./ui-navigation-history.mjs";
import { pinchStep } from "./ui-navigation-inputs.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function extrusion(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  const profile = await at(page, 5, 3);
  await chooseTool(page, "Return to Modeling", "modeling");
  await page.mouse.click(profile.x, profile.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  close((await navigationIdle(page)).preview.bodies[0].volume, 3000);
  await page.keyboard.press("Enter");
  const accepted = await navigationIdle(page);
  close(accepted.document.bodies[0].volume, 3000);
  return accepted;
}
export async function navigationOrderRoute(page, name) {
  const accepted = await extrusion(page);
  await navigationRoundTrip(page, () => pinchStep(page, 35, 20), "View after accepted extrusion");
  await navigationHistory(page);
  const geometryUndo = await navigationHistory(page);
  assert.equal(geometryUndo.document.bodies?.length ?? 0, 0, "Second Undo reaches extrusion");
  assert.equal((await navigationTips(page)).length, 0, "Older view redo expires at geometry Undo");
  assert.deepEqual((await navigationHistory(page, true)).document, accepted.document);
  const undone = await navigationHistory(page);
  await navigationRoundTrip(page, () => pinchStep(page, 25, 15), "View after geometry Undo");
  const restored = await navigationHistory(page, true);
  assert.deepEqual(restored.document, accepted.document, "Geometry Redo survives view Undo/Redo");
  assert.deepEqual(restored.modelingSelection, accepted.modelingSelection);
  assert.equal((await navigationTips(page)).length, 0);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  const picked = await navigationIdle(page);
  assert.ok(picked.modelingSelection.length);
  await navigationRoundTrip(page, () => pinchStep(page, 25, 15), "Selection expiration setup");
  const panned = await navigationIdle(page);
  await page.mouse.click(1050, 700);
  const cleared = await navigationIdle(page);
  assert.deepEqual(cleared.modelingSelection, []);
  assert.equal(
    (await navigationTips(page)).length,
    0,
    "Selection-only change expires the view tip",
  );
  const repicked = await navigationHistory(page);
  assert.deepEqual(repicked.modelingSelection, picked.modelingSelection);
  assert.deepEqual(
    repicked.camera.target,
    panned.camera.target,
    "Selection Undo does not revive camera tip",
  );
  assert.deepEqual((await navigationHistory(page)).modelingSelection, accepted.modelingSelection);
  assert.deepEqual((await navigationHistory(page)).document, undone.document);
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  assert.ok((await navigationIdle(page)).modelingSelection.length);
  await navigationRoundTrip(page, () => pinchStep(page, 20, 10), "Undone-view expiration setup");
  await navigationHistory(page);
  await page.mouse.click(1050, 700);
  await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 0, "Selection also expires an undone view tip");
  assert.deepEqual((await navigationHistory(page, true)).document, accepted.document);
  await selectedWorkspaceEntry(page);
  await extrusion(page);
  await navigationHistory(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [30, 0], [40, 10]);
  await navigationIdle(page);
  assert.equal((await navigationTips(page)).length, 0, "Accepted drawing expires navigation");
  assert.ok((await navigationIdle(page)).commands.find((entry) => entry.id === "redo").unavailable);
  console.log(
    `${name}: real extrusion/view/selection ordering, retained geometry Redo, selected workspace entry and new edit expiration passed`,
  );
}
async function selectedWorkspaceEntry(page) {
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  const selected = await navigationIdle(page);
  assert.ok(selected.modelingSelection.length);
  const { before } = await navigationRoundTrip(
    page,
    async () => {
      await page.getByLabel("Modeling viewport", { exact: true }).focus();
      await page.keyboard.press("Enter");
    },
    "Selected geometry workspace entry",
  );
  assertNavigation(before, selected);
}
