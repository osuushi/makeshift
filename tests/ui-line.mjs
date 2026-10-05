import assert from "node:assert/strict";
import { click, drag, inspect, pointEquals, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function lineRoute(page, name) {
  await reset(page);
  const tool = page.getByRole("button", { name: "Line (L)" });
  assert.equal(await tool.isVisible(), false);
  await page.keyboard.press("l");
  assert.equal((await inspect(page)).activePlane, null);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await drag(page, [-10, 0], [0, 0]);
  assert.equal((await inspect(page)).tool, "line");
  // A click after release must neither extend the line nor commit another one.
  await click(page, 15, 15);
  assert.equal(await page.getByRole("alert").isVisible(), false);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 1);
  await drag(page, [10, 10], [20, 10]);
  let sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 2);
  assert.equal(sketch.constraints.length, 0);
  pointEquals(sketch.curves[1].a, [10, 10]);
  pointEquals(sketch.curves[1].b, [20, 10]);
  assert.equal((await inspect(page)).tool, "line");
  // Clicking a point switches to Select; L explicitly resumes drawing.
  await click(page, -5, 0);
  assert.deepEqual((await inspect(page)).selection, [sketch.curves[0].id]);
  await click(page, 0, 0);
  await drag(page, [0, 0], [0, 6]);
  sketch = (await inspect(page)).document.sketches[0];
  assert.equal(sketch.curves.length, 2);
  pointEquals(sketch.curves[0].b, [0, 6]);
  pointEquals(sketch.curves[1].a, [10, 10]);
  await page.getByRole("textbox", { name: "Length", exact: true }).fill("20");
  await page.keyboard.press("Tab");
  await settled(page);
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("0");
  await page.keyboard.press("Enter");
  sketch = (await inspect(page)).document.sketches[0];
  pointEquals(sketch.curves[0].a, [-10, 0]);
  pointEquals(sketch.curves[0].b, [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [-20, -10], [-10, -10]);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
  assert.equal((await inspect(page)).tool, "line");
  await page.keyboard.press("Delete");
  await commandCompleted(page);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 2);
  await page.keyboard.press("Control+z");
  await commandCompleted(page);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
  console.log(
    `${name}: independent line drags, retained tool, selection/endpoint precedence, dimensions and Delete/Undo passed`,
  );
}

async function commandCompleted(page) {
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return (
      !state.busy && state.commands.every((command) => command.unavailable !== "Switching tools…")
    );
  });
}
