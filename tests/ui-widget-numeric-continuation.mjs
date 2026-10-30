import assert from "node:assert/strict";
import { drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// A real released pointer gesture must preserve its field and keyboard owner.
// Model tests cannot catch DOM focus advancing from a handle instead of its field.
export async function bodyNumericContinuation(page) {
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await chooseTool(page, "transform", "transform");
  const before = (await inspect(page)).document;
  const handle = await page.getByRole("button", { name: "Move body X", exact: true }).boundingBox();
  assert.ok(handle);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 45, handle.y + handle.height / 2);
  await page.mouse.up();
  const x = page.getByRole("textbox", { name: "Body translation X", exact: true });
  const value = await x.inputValue();
  assert.ok(Math.abs(Number(value)) > 0);
  assert.deepEqual((await inspect(page)).document, before, "Release retains the editable preview");
  await page.keyboard.press("Tab");
  assert.equal(await x.evaluate((input) => input === document.activeElement), true);
  assert.equal(await x.inputValue(), value);
  await page.keyboard.insertText("7");
  await page.keyboard.press("Tab");
  await page.waitForFunction(
    () => document.activeElement?.getAttribute("aria-label") === "Body translation Y",
  );
  const after = (await inspect(page)).document;
  assert.ok(Math.abs(after.bodies[0].center[0] - before.bodies[0].center[0] - 7) < 1e-6);
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  console.log("Released body Move retains value; first Tab refines it and next Tab accepts into Y");
}

export async function sketchNumericContinuation(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-10, 0], [10, 0]);
  await chooseTool(page, "move", "move");
  const before = (await inspect(page)).document;
  const handle = await page.locator('[data-move-marker="x"]').boundingBox();
  assert.ok(handle);
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2);
  await page.mouse.up();
  await inspect(page);
  const input = page.getByRole("textbox", { name: "Move X", exact: true });
  const value = await input.inputValue();
  assert.ok(Math.abs(Number(value)) > 0, "Sketch translation keeps its displacement after release");
  await page.keyboard.press("Tab");
  assert.equal(await input.evaluate((field) => field === document.activeElement), true);
  assert.equal(await input.inputValue(), value);
  await page.keyboard.insertText("9");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Move Y");
  const after = (await inspect(page)).document;
  assert.ok(
    Math.abs(after.sketches[0].curves[0].a.x - before.sketches[0].curves[0].a.x - 9) < 1e-6,
  );
  await page.keyboard.press("Escape");
  console.log("Released sketch Move retains displacement and numeric refinement replaces it");
}
