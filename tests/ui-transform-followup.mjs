import assert from "node:assert/strict";
import { at, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const close = (a, b) => assert.ok(Math.abs(a - b) < 0.15, `${a} != ${b}`);
async function center(locator) {
  await locator.waitFor({ state: "visible" });
  const bounds = await locator.boundingBox();
  assert.ok(bounds);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}
async function handleDrag(page, key, dx, dy, modifiers = []) {
  const p = await center(page.locator(`.transform-box-handle[data-handle="${key}"]`));
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 8 });
  await page.mouse.up();
  for (const key of [...modifiers].reverse()) await page.keyboard.up(key);
  return inspect(page);
}
async function commandDrag(page, from, dx, dy) {
  await page.keyboard.down("Meta");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  return inspect(page);
}

export async function transformFollowupRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("r");
  await drag(page, [0, 0], [20, 10]);
  await chooseTool(page, "transform", "transform");
  const sphere = page.getByRole("button", { name: "Reposition sketch pivot", exact: true });
  const original = await center(sphere);
  const a = await at(page, 0, 0),
    b = await at(page, 10, 0);
  let state = await handleDrag(page, "1,0,0", b.x - a.x, b.y - a.y);
  const points = state.preview.sketches[0].curves.flatMap((c) => [c.a, c.b]);
  close(Math.min(...points.map((p) => p.x)), 0);
  close(Math.max(...points.map((p) => p.x)), 30);
  const fixed = await center(sphere);
  assert.ok(Math.hypot(fixed.x - original.x, fixed.y - original.y) < 1);
  assert.ok(await page.locator('[data-move-marker="x"]').count());
  await page.keyboard.press("Escape");
  await inspect(page);
  state = await handleDrag(page, "1,0,0", b.x - a.x, 0, ["Alt"]);
  const symmetric = state.preview.sketches[0].curves.flatMap((c) => [c.a, c.b]);
  close(Math.min(...symmetric.map((p) => p.x)), -10);
  close(Math.max(...symmetric.map((p) => p.x)), 30);
  await page.keyboard.press("Escape");
  await inspect(page);
  state = await handleDrag(page, "1,0,0", b.x - a.x, 0, ["Shift"]);
  const uniform = state.preview.sketches[0].curves.flatMap((c) => [c.a, c.b]);
  assert.ok(Math.max(...uniform.map((p) => p.y)) > 10);
  close(Math.min(...uniform.map((p) => p.y)), 0);
  await page.keyboard.press("Escape");
  await inspect(page);
  const inside = await at(page, 7, 3);
  const moved = await commandDrag(page, inside, b.x - a.x, 0);
  close(Math.min(...moved.document.sketches[0].curves.flatMap((c) => [c.a.x, c.b.x])), 10);
  assert.equal(moved.camera.orbitActive, false);
  await chooseTool(page, "undo", "undo");
  const before = (await inspect(page)).document;
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  await inspect(page);
  const scaledMove = await commandDrag(page, inside, b.x - a.x, 0);
  assert.equal(scaledMove.interaction, null);
  close(Math.min(...scaledMove.document.sketches[0].curves.flatMap((c) => [c.a.x, c.b.x])), 10);
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await page.keyboard.press("c");
  await drag(page, [24, -8], [31, -8]);
  await chooseTool(page, "transform", "transform");
  await page.locator(".transform-box-handle:not([hidden])").first().click();
  await page.getByRole("textbox", { name: "Transform scale X", exact: true }).fill("1.5");
  await inspect(page);
  const pivotStart = await center(sphere);
  await page.mouse.move(pivotStart.x, pivotStart.y);
  await page.mouse.down();
  await page.mouse.move(pivotStart.x + 25, pivotStart.y + 20, { steps: 8 });
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction?.kind, undefined);
  const pivotEnd = await center(sphere);
  assert.ok(Math.hypot(pivotEnd.x - pivotStart.x - 25, pivotEnd.y - pivotStart.y - 20) < 1);
  assert.notDeepEqual((await inspect(page)).document, before);
  console.log(
    `${name}: opposite-side, Option symmetric, Shift uniform, stable anchor, Command move and widget handoff passed`,
  );
}
