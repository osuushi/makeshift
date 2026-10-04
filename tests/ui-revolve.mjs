import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { standaloneOnly } from "./ui-cleanup-controls.mjs";
import { at, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { widgetPresentation } from "./ui-widget-presentation.mjs";

async function value(page, name, value) {
  await page.getByRole("textbox", { name, exact: true }).fill(String(value));
  await inspect(page);
}
export async function revolveRoute(page, name, electron, checkStandalone = false) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.mouse.move(640, 425);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -90);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => window.makeshiftInspect().camera.height < 40);
  await page.keyboard.press("r");
  await drag(page, [5, 0], [7, 2]);
  await page.keyboard.press("l");
  await drag(page, [2, -6], [2, 4]);
  const center = await at(page, 6, 1),
    axis = await at(page, 2, -4),
    world = await at(page, 0, -4);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await chooseTool(page, "revolve", "revolve");
  assert.equal((await inspect(page)).preview, null, "Axis must be explicit");
  await page.mouse.move(axis.x, axis.y);
  await page.mouse.click(axis.x, axis.y);
  let state = await inspect(page);
  assert.equal(state.interaction.kind, "revolve");
  close(state.preview.bodies[0].volume, 32 * Math.PI);
  const original = state.document;
  await page.getByRole("button", { name: "Change revolution axis", exact: true }).click();
  await page.mouse.click(world.x, world.y);
  state = await inspect(page);
  close(state.preview.bodies[0].volume, 48 * Math.PI);
  await value(page, "Revolution angle", 90);
  close((await inspect(page)).preview.bodies[0].volume, 12 * Math.PI);
  // Edge-on rotation hides its hit target; typing remains available. Orbit reveals it.
  const handle = page.getByRole("button", { name: "Drag revolution angle", exact: true });
  await orient(page, [0, 0, 1]);
  assert.equal(await handle.isVisible(), false);
  await orient(page, [0, 1, 0]);
  const { displayed } = await widgetPresentation(page, "Drag revolution angle");
  await page.mouse.move(displayed.x, displayed.y);
  const { offset } = await widgetPresentation(page, "Drag revolution angle");
  await page.mouse.down();
  const around = await project(page, [3, 1, -3 * Math.sqrt(3)]);
  await page.mouse.move(around.x + offset.x, around.y + offset.y, { steps: 5 });
  await page.mouse.up();
  state = await inspect(page);
  assert.deepEqual(state.document, original);
  assert.ok(state.preview.bodies[0].volume < 12 * Math.PI);
  await value(page, "Revolution height", 10);
  await value(page, "Revolution angle", 720);
  state = await inspect(page);
  assert.ok(Math.abs(state.preview.bodies[0].volume - 96 * Math.PI) < 0.001);
  const bounds = state.preview.bodies[0].bounds;
  assert.ok(Math.abs(bounds[4] - 12) < 0.001, "Height is total travel, not pitch");
  await spatialDrag(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-helix-preview.png` });
  // Multiple turns without height keep the last good display, but cannot be accepted.
  await value(page, "Revolution height", 0);
  assert.ok(
    await page.getByRole("button", { name: "Accept revolution", exact: true }).isDisabled(),
  );
  assert.deepEqual((await inspect(page)).document, original);
  await value(page, "Revolution height", 10);
  await page.keyboard.press("Enter");
  assert.equal(
    (await inspect(page)).interaction.kind,
    "revolve",
    "Field Enter only applies its value",
  );
  await acceptRevolution(page, name, electron, checkStandalone, original);
  console.log(
    `${name}: explicit line/world revolve axes, partial/full/helix, angle drag, invalid recovery, accept and archive passed`,
  );
}

async function acceptRevolution(page, name, electron, checkStandalone, original) {
  const candidate = (await inspect(page)).preview;
  if (checkStandalone) {
    await standaloneOnly(page);
    await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  } else await page.keyboard.press("Enter");
  await modalCompleted(page);
  const accepted = (await inspect(page)).document;
  assert.deepEqual(accepted, candidate, "Ordinary revolution preserves candidate topology");
  assert.equal(accepted.bodies.length, 1);
  assert.equal((await inspect(page)).interaction, null);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-helix`, electron);
}

async function spatialDrag(page) {
  await orient(page, [0, 1, 0]);
  const { displayed } = await widgetPresentation(page, "Drag revolution angle");
  const around = await project(page, [6 * Math.SQRT1_2, 11, -6 * Math.SQRT1_2]);
  await page.mouse.move(displayed.x, displayed.y);
  const { offset } = await widgetPresentation(page, "Drag revolution angle");
  await page.mouse.down();
  await page.mouse.move(around.x + offset.x, around.y + offset.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
  assert.equal(
    Number(await page.getByRole("textbox", { name: "Revolution angle", exact: true }).inputValue()),
    765,
  );
  await value(page, "Revolution angle", 720);
  const heightHandle = await page
    .getByRole("button", { name: "Drag revolution height", exact: true })
    .boundingBox();
  await page.mouse.move(
    heightHandle.x + heightHandle.width / 2,
    heightHandle.y + heightHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    heightHandle.x + heightHandle.width / 2,
    heightHandle.y + heightHandle.height / 2 - 22,
    { steps: 5 },
  );
  await page.mouse.up();
  await inspect(page);
  assert.ok(
    Number(
      await page.getByRole("textbox", { name: "Revolution height", exact: true }).inputValue(),
    ) > 10,
  );
  await value(page, "Revolution height", -10);
  await value(page, "Revolution angle", -450);
  assert.ok(Math.abs((await inspect(page)).preview.bodies[0].volume - 60 * Math.PI) < 0.001);
  await value(page, "Revolution height", 10);
  await value(page, "Revolution angle", 720);
  await orient(page, [1, -2, 1]);
}
