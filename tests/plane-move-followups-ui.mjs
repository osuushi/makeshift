import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { inspect, reset } from "./ui-helpers.mjs";
import { pickPlane } from "./ui-plane-targets.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Escaped controller boundary: reference picking used to stay active during Move,
// swallowing model-selection clicks and relocating/cancelling the plane preview.
await withUiRuntimes(async (page) => {
  await reset(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  let state = await inspect(page);
  assert.equal(state.document.constructionPlanes.length, 1, "Picking creates immediately");
  assert.equal(state.interaction, null, "Placement leaves idle Move handles");
  assert.equal(state.modelingTool, "move");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("12");
  assert.deepEqual((await inspect(page)).document.constructionPlanes[0].frame.origin, [0, 0, 0]);
  // Clicking a different reference accepts Move; it must not snap the edited plane there.
  await pickPlane(page, "YZ");
  state = await inspect(page);
  assert.deepEqual(state.document.constructionPlanes[0].frame.origin, [0, 0, 12]);
  assert.equal(state.interaction, null);
  await chooseTool(page, "construction plane", "construction-plane");
  state = await inspect(page);
  assert.equal(state.document.constructionPlanes.length, 2, "Selected world plane skips picker");
  assert.equal(state.interaction, null);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
  assert.equal((await inspect(page)).modelingTool, "move");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Move plane X", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation X", exact: true }).fill("7");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.constructionPlanes[0].frame.origin, [0, 0, 12]);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
  await page.keyboard.press("Meta+Enter");
  assert.ok((await inspect(page)).activePlane, "Cmd-Enter enters selected saved plane");
  await chooseTool(page, "return to modeling", "modeling");
  const hide = page.getByRole("button", { name: "Hide Plane 1", exact: true });
  assert.equal(await hide.locator("svg").count(), 1);
  await hide.click();
  const show = page.getByRole("button", { name: "Show Plane 1", exact: true });
  assert.equal(await show.locator("svg path").count(), 2, "Hidden plane uses crossed eye");
  await show.click();
  // General Delete capture must defer to the saved-plane controller. Model tests
  // cannot catch listener registration order swallowing this keyboard event.
  for (const key of ["Backspace", "Delete"]) {
    await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
    await page.keyboard.press(key);
    assert.equal((await inspect(page)).document.constructionPlanes.length, 1);
    await chooseTool(page, "undo", "undo");
    assert.equal((await inspect(page)).document.constructionPlanes.length, 2);
  }
  console.log(
    "Construction plane immediate placement, default Move, selection acceptance and Escape passed",
  );
});
