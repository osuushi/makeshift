import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect, reset } from "./ui-helpers.mjs";
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
  await rotationFeedback(page);
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
  await behindCanonicalRoute(page);
  console.log("Construction plane lifecycle and behind-canonical picking passed");
});

async function rotationFeedback(page) {
  // Model tests cannot catch a stale DOM field while the placement frame rotates.
  const original = (await inspect(page)).document;
  await chooseTool(page, "transform", "transform");
  const handle = await page
    .getByRole("button", { name: "Rotate plane X", exact: true })
    .boundingBox();
  assert.ok(handle);
  const angle = page.getByRole("textbox", { name: "Plane rotation X", exact: true });
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  for (const distance of [30, 60]) {
    await page.mouse.move(
      handle.x + handle.width / 2 + distance,
      handle.y + handle.height / 2 + 20,
    );
    const frame = (await inspect(page)).preview.constructionPlanes[0].frame;
    const degrees = (Math.atan2(frame.v[2], frame.v[1]) * 180) / Math.PI;
    assert.ok(Math.abs(degrees) > 1, "Pointer drag rotates the plane");
    assert.ok(Math.abs(Number(await angle.inputValue()) - degrees) < 0.0001);
  }
  await page.mouse.up();
  const released = await angle.inputValue();
  await page.keyboard.press("Tab");
  assert.equal(await angle.evaluate((input) => input === document.activeElement), true);
  assert.equal(await angle.inputValue(), released);
  await page.keyboard.press("Enter");
  const accepted = (await inspect(page)).document.constructionPlanes[0].frame;
  assert.ok(
    Math.abs((Math.atan2(accepted.v[2], accepted.v[1]) * 180) / Math.PI - Number(released)) <
      0.0001,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Select Plane 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  await page.getByRole("button", { name: "Rotate plane X", exact: true }).click();
  await angle.fill("12.3400");
  assert.equal(await angle.inputValue(), "12.3400", "Numeric entry preserves the typed text");
  await page.keyboard.press("Escape");
}

async function behindCanonicalRoute(page) {
  // Canonical capture must defer to saved planes even behind the primary grid.
  // Picker unit tests cannot exercise competing canvas capture listeners.
  await reset(page);
  await chooseTool(page, "construction plane", "construction-plane");
  await pickPlane(page, "XY");
  await orient(page, [1, 1, 1]);
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("-12");
  await page.keyboard.press("Enter");
  await orient(page, [0, 0, 1]);
  await page.keyboard.press("Escape");
  const point = await project(page, [8, 8, -12]);
  await page.mouse.move(point.x, point.y);
  assert.equal(
    (await inspect(page)).planeTargets.some((p) => p.hovered),
    false,
  );
  await page.mouse.click(point.x, point.y);
  assert.equal(
    await page
      .getByRole("button", { name: "Select Plane 1", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Hide Plane 1", exact: true }).click();
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).planeTargets.find((p) => p.id === "XY").selected, true);
  await page.getByRole("button", { name: "Show Plane 1", exact: true }).click();
  await page.mouse.dblclick(point.x, point.y);
  assert.ok((await inspect(page)).activePlane);
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [0, 0], [10, 10]);
  assert.deepEqual((await inspect(page)).document.sketches[0].plane.origin, [0, 0, -12]);
}
