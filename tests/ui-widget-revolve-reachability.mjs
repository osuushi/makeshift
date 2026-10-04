import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { acceptHistory, assertWidgetTargets, sweepWidgets } from "./ui-widget-reachability.mjs";
import { rotateDocked } from "./ui-widget-rotation.mjs";
import { panTo } from "./ui-widget-wheel.mjs";

const button = (page, name) => page.getByRole("button", { name, exact: true });
export async function revolveReachability(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  if ((await inspect(page)).gridSnap) await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [5, 0], [7, 2]);
  await page.keyboard.press("l");
  await drag(page, [2, -6], [2, 4]);
  const center = await at(page, 6, 1),
    axis = await at(page, 2, -4);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const before = (await inspect(page)).document;
  await chooseTool(page, "revolve", "revolve");
  await page.mouse.click(axis.x, axis.y);
  await page.getByRole("textbox", { name: "Revolution angle", exact: true }).fill("90");
  await inspect(page);
  const selector =
    ".revolve-controls:not([hidden]) > .revolve-spatial:not([hidden]), .revolve-controls:not([hidden]) > .revolve-quantity:not([hidden]), .revolve-controls:not([hidden]) > .revolve-options:not([hidden])";
  await sweepWidgets(page, [6, 1, 0], selector, "Revolve");
  await orient(page, [0, 1, 0]);
  const canvas = await page.locator("#world canvas").boundingBox();
  await panTo(page, [6, 1, 0], { x: -40, y: canvas.height / 2 });
  let state = await rotateDocked(
    page,
    button(page, "Drag revolution angle"),
    [2, 1, 0],
    [0, 1, 0],
    30,
  );
  // Revolve Shift bypasses whole-degree snapping, unlike Move's half-degree snap.
  const angle = 90 + state.rotationInput.deliveredAngle;
  const field = Number(
    await page.getByRole("textbox", { name: "Revolution angle", exact: true }).inputValue(),
  );
  assert.ok(Math.abs(field - Math.round(angle * 1000) / 1000) < 1e-6);
  assert.ok(
    Math.abs(state.preview.bodies[0].volume - (32 * Math.PI * angle) / 360) < 0.001,
    JSON.stringify({
      angle,
      volume: state.preview.bodies[0].volume,
      input: state.rotationInput,
      gesture: state.widgetGesture,
    }),
  );
  await page.getByRole("textbox", { name: "Revolution angle", exact: true }).fill("120");
  state = await inspect(page);
  assert.ok(Math.abs(state.preview.bodies[0].volume - (32 * Math.PI) / 3) < 0.001);
  await page.getByRole("textbox", { name: "Revolution height", exact: true }).fill("5");
  state = await inspect(page);
  assert.ok(state.preview.bodies[0].volume > 0);
  await assertWidgetTargets(page, selector, "Revolve height/angle transport");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, before);
  await panTo(page, [6, 1, 0], { x: canvas.width / 2, y: canvas.height / 2 });
  await orient(page, [0, 0, 1]);
  await chooseTool(page, "revolve", "revolve");
  // The axis is explicit on every fresh invocation; recover its projected line.
  const pick = await project(page, [2, -4, 0]);
  await page.mouse.click(pick.x, pick.y);
  await inspect(page);
  await acceptHistory(page, button(page, "Accept revolution"), before);
  console.log(
    `${name}: docked Revolve rotation/height, native volume, Cancel and one Undo/Redo passed`,
  );
}
