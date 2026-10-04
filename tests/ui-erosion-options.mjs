import assert from "node:assert/strict";
import { plate } from "./ui-body-fillet.mjs";
import { accurateErosion } from "./ui-erosion-method.mjs";
import { inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function erosionOptionsRoute(page, name) {
  await plate(page);
  await chooseTool(page, "select owning bodies", "selection-bodies");
  await accurateErosion(page);
  const input = page.getByRole("textbox", { name: "Erode by", exact: true });
  const allowance = page.getByRole("textbox", { name: "Extra thickness allowance", exact: true });
  assert.equal(await input.inputValue(), "1");
  assert.equal(await allowance.inputValue(), "50");
  assert.equal(await allowance.locator("..").locator("span").textContent(), "%");
  const original = (await inspect(page)).document;
  const handle = page.getByRole("button", { name: "Erosion distance handle" });
  assert.equal((await inspect(page)).preview.bodies.length, 2);
  await input.fill("2");
  await inspect(page);
  assert.equal(await allowance.inputValue(), "50");
  const keep = page.getByRole("button", { name: "Keep originals", exact: true });
  assert.equal(await keep.getAttribute("aria-pressed"), "true");
  await keep.click();
  let state = await inspect(page);
  assert.equal(state.preview.bodies.length, 1);
  assert.notEqual(state.preview.bodies[0].id, original.bodies[0].id);
  assert.deepEqual(state.document, original);
  const contained = await page.locator(".erosion-widget .axial-panel").evaluate((panel) => {
    const box = panel.getBoundingClientRect();
    return [...panel.querySelectorAll("small")].every((label) => {
      const range = document.createRange();
      range.selectNodeContents(label);
      const text = range.getBoundingClientRect();
      return text.left >= box.left && text.right <= box.right && text.bottom <= box.bottom;
    });
  });
  assert.ok(contained, "All labels and result text fit inside the panel");
  assert.doesNotMatch(await page.locator(".erosion-widget").textContent(), /cavity|shell/i);
  await page.screenshot({ path: `.cache/sketch-review/${name}-erosion-options.png` });
  await page.getByRole("button", { name: "Accept erosion" }).click();
  state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  const operation = (await page.evaluate(() => window.makeshiftHistory())).at(-1).operation;
  assert.equal(operation.parameters.operation.thickness, 2);
  assert.equal(operation.parameters.operation.allowance, 1, "50% of 2 mm reaches geometry as 1 mm");
  assert.notEqual(state.document.bodies[0].id, original.bodies[0].id);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await page.getByRole("button", { name: "Select Body 1", exact: true }).click();
  await accurateErosion(page);
  assert.equal(await keep.getAttribute("aria-pressed"), "true", "Fresh edits reset Keep originals");
  await keep.click();
  await inspect(page);
  // Outward dragging reaches a useful positive bound, never a negative request.
  const box = await handle.boundingBox();
  const direction = await handle.evaluate((button) => ({
    x: Number(button.dataset.directionX),
    y: Number(button.dataset.directionY),
  }));
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - direction.x * 40, y - direction.y * 40, { steps: 5 });
  await page.mouse.up();
  state = await inspect(page);
  assert.ok(Number(await input.inputValue()) > 0);
  assert.equal(await allowance.inputValue(), "50", "Dragging retains the allowance percentage");
  assert.ok(state.preview?.bodies.length === 1);
  assert.equal(await input.getAttribute("aria-invalid"), "false");
  await input.fill("6");
  assert.equal((await inspect(page)).preview.bodies.length, 0);
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).document.bodies.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: positive defaults/drag bound, panel layout, keep/replace, empty replacement and Undo passed`,
  );
}
