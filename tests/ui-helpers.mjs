import assert from "node:assert/strict";
import { chooseTool } from "./ui-tools.mjs";
export async function settled(page) {
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect?.();
    return state && !state.busy && !state.camera.moving;
  });
}
// Native busy can end before an ordinary modal acceptance continuation finishes.
export async function modalCompleted(page) {
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return !state.busy && state.interaction === null;
  });
}
export async function inspect(page) {
  await settled(page);
  return page.evaluate(() => window.makeshiftInspect());
}
export async function reset(page) {
  await settled(page);
  await chooseTool(page, "new document", "new");
  const discard = page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Don’t Save", exact: true });
  if (await discard.isVisible()) await discard.click();
  await settled(page);
  // Idle alone does not establish that ordinary New replaced the document.
  await page.waitForFunction(() => {
    const state = window.makeshiftInspect();
    return (
      !state.busy &&
      !state.camera.moving &&
      state.interaction === null &&
      state.document.sketches.length === 0 &&
      (state.document.bodies?.length ?? 0) === 0 &&
      (state.document.constructionPlanes?.length ?? 0) === 0
    );
  });
  await page.reload();
  await settled(page);
}
export async function at(page, x, y) {
  const { projection: p } = await inspect(page);
  assert.ok(p, "A sketch plane must be explicitly active");
  return {
    x: p.origin.x + (p.u.x - p.origin.x) * x + (p.v.x - p.origin.x) * y,
    y: p.origin.y + (p.u.y - p.origin.y) * x + (p.v.y - p.origin.y) * y,
  };
}
export async function drag(page, from, to, modifiers = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  const a = await at(page, ...from),
    b = await at(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  for (const modifier of modifiers) await page.keyboard.up(modifier);
  await settled(page);
}
export async function click(page, x, y) {
  const point = await at(page, x, y);
  await page.mouse.click(point.x, point.y);
}
// Overlay refresh replaces SVG nodes. Resolve and measure in one browser turn.
/**
 * @param {import("playwright").Page} page
 * @param {string} selector
 * @param {number} [index]
 * @returns {Promise<{ x: number, y: number }>}
 */
export async function overlayPoint(page, selector, index = 0) {
  const point = await page.waitForFunction(
    ({ selector, index }) => {
      const box = document.querySelectorAll(selector)[index]?.getBoundingClientRect();
      return box && box.width > 0 && box.height > 0
        ? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        : false;
    },
    { selector, index },
  );
  try {
    return await point.jsonValue();
  } finally {
    await point.dispose();
  }
}
export async function corners(page) {
  const { document } = await inspect(page);
  const sketch = document.sketches[0];
  assert.ok(sketch?.groups[0], "A committed rectangle must exist");
  return sketch.groups[0].members.map((id) => sketch.curves.find((curve) => curve.id === id).a);
}
export function close(actual, expected, label = "coordinate") {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: ${actual} != ${expected}`);
}
export function pointEquals(actual, expected) {
  close(actual.x, expected[0], "x");
  close(actual.y, expected[1], "y");
}

export async function inspectPointChoices(page, x, y) {
  const point = await at(page, x, y);
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
}
