import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { at, click, close, corners, drag, inspect, reset, settled } from "./ui-helpers.mjs";
import { previewActionReady } from "./ui-preview-readiness.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function changeScale(page, value, tools = false) {
  if (tools) await chooseTool(page, "user interface scale", "settings");
  else await page.locator(".settings-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("combobox", { name: "User interface scale" }).selectOption(String(value));
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await settled(page);
}

export async function preferencesRoute(page) {
  const before = await inspect(page);
  const history = await page.evaluate(() => window.makeshiftHistory());
  const bounds = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  for (const scale of [0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
    await changeScale(page, scale, scale === 1.25);
    const font = await page
      .locator(".settings-trigger")
      .evaluate((button) => Number.parseFloat(getComputedStyle(button).fontSize));
    assert.ok(Math.abs(font - 14 * scale) < 0.05, `Actual CSS interface font scales to ${scale}`);
    const cube = await page.locator(".orientation-cube").boundingBox();
    assert.ok(
      Math.abs(cube.width - 144 * scale) < 0.03,
      "Cube dimensions allow CSS subpixel layout rounding",
    );
    assert.deepEqual(
      await page.getByLabel("Modeling viewport", { exact: true }).boundingBox(),
      bounds,
    );
    assert.deepEqual((await inspect(page)).document, before.document);
    assert.deepEqual((await inspect(page)).camera, before.camera);
    assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
  }
  await page.reload();
  await settled(page);
  await page.locator(".settings-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  assert.equal(
    await dialog.getByRole("combobox", { name: "User interface scale" }).inputValue(),
    "1.5",
  );
  await dialog.getByRole("button", { name: "Reset to 100%" }).click();
  assert.equal(
    await dialog.getByRole("combobox", { name: "User interface scale" }).inputValue(),
    "1",
  );
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await settled(page);
  assert.equal(await page.evaluate(() => localStorage.getItem("makeshift.ui-scale")), "1");
  await page.evaluate(() => localStorage.setItem("makeshift.ui-scale", "0.01"));
  await page.reload();
  await settled(page);
  assert.equal(
    await page.evaluate(() => document.documentElement.style.getPropertyValue("--ui-scale")),
    "1",
  );
}

export async function geometryScaleRoute(page, scale, name) {
  await reset(page);
  await changeScale(page, scale);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
  const width = page.getByRole("textbox", { name: "Width", exact: true });
  const bounds = await width.boundingBox();
  assert.ok(Math.abs(bounds.width - 56 * scale) < 0.1, "Numeric widget dimensions scale");
  await width.fill("24");
  await page.keyboard.press("Enter");
  let points = await corners(page);
  close(points[1].x - points[0].x, 24);
  await page.keyboard.press("Escape");
  await click(page, 12, 5);
  await drag(page, [12, 5], [16, 9]);
  points = await corners(page);
  close(points[0].x, 4);
  close(points[0].y, 4);
  const moved = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.notDeepEqual((await inspect(page)).document, moved);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, moved);
  await page.keyboard.press("Escape");
  const pick = await at(page, 12, 8);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(pick.x, pick.y);
  const arrow = page.getByRole("button", { name: "Drag extrusion", exact: true });
  await arrow.click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill("5");
  await page.keyboard.press("Enter");
  close((await inspect(page)).preview.bodies[0].volume, 1200);
  await previewActionReady(page, "Accept extrusion");
  await page.getByRole("button", { name: "Accept extrusion", exact: true }).click();
  await page.waitForFunction(() => window.makeshiftInspect().document.bodies?.length === 1);
  close((await inspect(page)).document.bodies[0].volume, 1200);
  const face = await project(page, [12, 8, 5]);
  await page.mouse.click(face.x, face.y);
  assert.equal((await inspect(page)).modelingSelection[0].kind, "face");
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await page.keyboard.press("m");
  await page.getByRole("button", { name: "Move body X", exact: true }).click();
  await page.locator(".body-transform-value").fill("4");
  await page.keyboard.press("Enter");
  close((await inspect(page)).document.bodies[0].center[0], 20);
  await page.locator(".transform-box-handle:visible").last().click();
  const card = await page.locator(".scale-card:visible").boundingBox();
  const viewport = await page.getByLabel("Modeling viewport", { exact: true }).boundingBox();
  assert.ok(card.x >= viewport.x && card.x + card.width <= viewport.x + viewport.width + 1);
  assert.ok(card.y >= viewport.y && card.y + card.height <= viewport.y + viewport.height + 1);
  await page.keyboard.press("Escape");
  await navigationScaleRoute(page, name, scale);
  // Exercise the real unsaved-document dialog, while retaining geometry.
  await chooseTool(page, "new document", "new");
  const unsaved = page.getByRole("dialog", { name: "Unsaved changes" });
  if (await unsaved.isVisible())
    await unsaved.getByRole("button", { name: "Cancel", exact: true }).click();
  await settled(page);
}

async function navigationScaleRoute(page, name, scale) {
  const before = await inspect(page);
  const viewport = page.getByLabel("Modeling viewport", { exact: true });
  await viewport.focus();
  for (const modifier of ["Meta", "Control"])
    for (const key of ["=", "-", "0", "+"]) await page.keyboard.press(`${modifier}+${key}`);
  assert.deepEqual((await inspect(page)).camera, before.camera);
  assert.equal(
    await page.evaluate(() => document.documentElement.style.getPropertyValue("--ui-scale")),
    String(scale),
  );
  const box = await viewport.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -40);
  await page.keyboard.up("Control");
  await page.waitForFunction(
    (height) => window.makeshiftInspect().camera.height < height,
    before.camera.height,
  );
  const cube = await page.locator(".orientation-cube").boundingBox();
  const tools = await page.getByRole("button", { name: "More tools", exact: true }).boundingBox();
  assert.ok(tools.x + tools.width < cube.x, "Scaled Tools and cube remain separate");
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await inspect(page);
  const top = (await inspect(page)).camera;
  await page.mouse.move(cube.x + cube.width / 2, cube.y + cube.height / 2);
  await page.mouse.down();
  await page.mouse.move(cube.x + cube.width / 2 + 30, cube.y + cube.height / 2 + 20, { steps: 6 });
  await page.mouse.up();
  assert.notDeepEqual((await inspect(page)).camera.position, top.position);
  const model = (await inspect(page)).document;
  await page.screenshot({ path: `.cache/sketch-review/${name}-ui-scale-${scale}.png` });
  assert.deepEqual(model, before.document, "Camera controls do not edit scaled geometry");
}
