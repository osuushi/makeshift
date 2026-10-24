import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function moveFieldsRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await page.keyboard.press("m");
  const original = (await inspect(page)).document;
  const angle = page.getByRole("textbox", { name: "Angle", exact: true });
  assert.equal(await angle.count(), 0);
  assert.equal(await page.locator(".scale-card").isVisible(), false);
  for (const label of ["Move X", "Move Y"]) {
    await page.keyboard.press("Tab");
    await page.waitForFunction(
      (label) => document.activeElement?.getAttribute("aria-label") === label,
      label,
    );
    assert.equal(await page.locator(".dimension input:visible").count(), 1);
  }
  await page.keyboard.press("Shift+Tab");
  await page.getByRole("textbox", { name: "Move X", exact: true }).fill("3");
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Move Y");
  const translated = (await inspect(page)).document.sketches[0].curves[0];
  assert.ok(Math.abs(translated.a.x - original.sketches[0].curves[0].a.x - 3) < 1e-6);
  await page.keyboard.press("Enter");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "rotate", "rotate");
  const from = (await inspect(page)).rotationHandle;
  const origin = await at(page, 0, 0);
  const dx = from.x - origin.x,
    dy = from.y - origin.y;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const degrees of [16, 31]) {
    const radians = (-degrees * Math.PI) / 180;
    await page.mouse.move(
      origin.x + dx * Math.cos(radians) - dy * Math.sin(radians),
      origin.y + dx * Math.sin(radians) + dy * Math.cos(radians),
      { steps: 8 },
    );
    const state = await inspect(page);
    const line = state.preview.sketches[0].curves[0];
    const actual = (Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI;
    assert.ok(Math.abs(actual - Math.round(degrees / 5) * 5) < 1e-6);
    assert.ok(Math.abs(Number(await angle.inputValue()) - actual) < 0.001);
  }
  await page.mouse.up();
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "rotate", "rotate");
  const rotation = (await inspect(page)).rotationHandle;
  await page.mouse.click(rotation.x, rotation.y);
  assert.equal(await angle.isVisible(), true);
  await angle.fill("90");
  await page.keyboard.press("Enter");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "scale", "scale");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  assert.equal(await page.locator(".scale-card").isVisible(), true);
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("2");
  await page.getByRole("button", { name: "Accept transform scale", exact: true }).click();
  const scaled = (await inspect(page)).document.sketches[0].curves;
  const xs = scaled.flatMap((c) => [c.a.x, c.b.x]);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - 40) < 1e-6);
  assert.equal(await page.locator(".scale-card").isVisible(), false);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  console.log(
    `${name}: Move field visibility, forward/reverse Tab, live rotation, numeric scale and Undo passed`,
  );
}
