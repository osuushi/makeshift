import assert from "node:assert/strict";
import { at, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function hiddenBodiesRoute(page, global = false) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  const extrude = async () => {
    await page.mouse.click(center.x, center.y);
    await page.getByRole("textbox", { name: "Extrusion distance" }).fill("10");
    return inspect(page);
  };
  await extrude();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  const original = (await inspect(page)).document.bodies[0];
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page
    .getByRole("button", { name: global ? "Hide bodies" : "Hide Body 1", exact: true })
    .click();
  let state = await extrude();
  assert.equal(
    await page
      .locator(".extrude-controls")
      .getByRole("button", { name: "Union", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    state.preview.bodies.length,
    2,
    "Hidden overlap must not trigger subtraction or union",
  );
  assert.deepEqual(
    state.preview.bodies.find((b) => b.id === original.id),
    original,
  );
  assert.equal(await page.getByRole("button", { name: "Target body 1", exact: true }).count(), 0);
  for (const mode of ["Subtract", "Intersect"]) {
    await page
      .locator(".extrude-controls")
      .getByRole("button", { name: mode, exact: true })
      .click();
    state = await inspect(page);
    assert.deepEqual(state.document.bodies, [original]);
    assert.equal(state.preview, null, "No visible target must reject the Boolean");
  }
  await page
    .locator(".extrude-controls")
    .getByRole("button", { name: "Union", exact: true })
    .click();
  await inspect(page);
  await page.keyboard.press("Enter");
  await modalCompleted(page);
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 2);
  assert.deepEqual(
    state.document.bodies.find((b) => b.id === original.id),
    original,
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document.bodies, [original]);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.bodies.length, 2);
}

export async function hiddenRevolveRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [10, 10]);
  const center = await at(page, 5, 5);
  const axis = await at(page, 0, -10);
  await chooseTool(page, "return to modeling", "modeling");
  const start = async () => {
    await page.mouse.click(center.x, center.y);
    await chooseTool(page, "revolve", "revolve");
    await page.mouse.click(axis.x, axis.y);
    return inspect(page);
  };
  await start();
  await page.getByRole("button", { name: "Accept revolution", exact: true }).click();
  const original = (await inspect(page)).document.bodies[0];
  await page.getByRole("button", { name: "Show Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  let state = await start();
  assert.equal(state.preview.bodies.length, 2);
  assert.deepEqual(
    state.preview.bodies.find((b) => b.id === original.id),
    original,
  );
  assert.equal(await page.getByRole("button", { name: "Target body 1", exact: true }).count(), 0);
  await page.getByRole("button", { name: "Subtract", exact: true }).click();
  state = await inspect(page);
  assert.deepEqual(state.document.bodies, [original]);
  assert.equal(
    await page.getByRole("button", { name: "Accept revolution", exact: true }).isDisabled(),
    true,
  );
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document.bodies, [original]);
}
