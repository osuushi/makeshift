import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

/** Create and select a cylinder using ordinary sketch/numeric/extrusion controls. */
export async function decoratorCylinder(page, radius = 8, distance = 10) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [8, 0]);
  const input = page.getByRole("textbox", { name: "Radius", exact: true });
  await input.fill(String(radius));
  await input.press("Enter");
  if (radius < 2) {
    const point = await at(page, 0, 0);
    const { camera } = await inspect(page);
    await page.mouse.move(point.x, point.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, Math.log(20 / camera.height) / 0.01);
    await page.keyboard.up("Control");
    await inspect(page);
  }
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await page.getByRole("textbox", { name: "Extrusion distance" }).fill(String(distance));
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await inspect(page);
  await orient(page, [0, -1, 0.3]);
  await worldClick(page, [0, -radius, distance / 2]);
  const state = await inspect(page);
  assert.equal(state.modelingSelection[0]?.kind, "face");
  assert.ok(
    Math.abs(state.document.bodies[0].faces.find((f) => f.cylinder).cylinder.radius - radius) <
      1e-7,
  );
  return state.document;
}
