// @ts-check
import assert from "node:assert/strict";
import {
  at,
  click,
  close,
  drag,
  inspect,
  overlayPoint,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

/** @param {import("playwright").Page} page */
const sketch = async (page) => (await inspect(page)).document.sketches[0];
/**
 * @param {import("playwright").Page} page
 * @param {number} value
 */
async function number(page, value) {
  await page.getByRole("button", { name: "Offset edge", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Offset distance", exact: true });
  await input.fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
/**
 * @param {import("playwright").Page} page
 * @param {number} dx
 * @param {number} dy
 */
async function offsetDrag(page, dx, dy) {
  await inspect(page); // Cancellation must settle before measuring the restored control.
  const handle = await overlayPoint(page, '[aria-label="Offset edge"]');
  const a = await at(page, 0, 0),
    b = await at(page, dx, dy);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + b.x - a.x, handle.y + b.y - a.y, {
    steps: 8,
  });
  await page.mouse.up();
  await inspect(page);
}
/**
 * @param {import("playwright").Page} page
 * @param {string} name
 */
export async function offsetRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("l");
    await drag(page, [-8, 0], [8, 0]);
    await page.getByRole("button", { name: "Lock Length", exact: true }).click();
    const before = await sketch(page);
    await number(page, 3);
    let result = await sketch(page);
    assert.equal(result.curves.length, 2);
    assert.deepEqual(result.curves[0], before.curves[0]);
    assert.deepEqual(result.constraints, before.constraints);
    pointEquals(result.curves[1].a, [-8, 3]);
    pointEquals(result.curves[1].b, [8, 3]);
    await page.getByRole("textbox", { name: "Length", exact: true }).fill("12");
    await page.keyboard.press("Enter");
    result = await sketch(page);
    assert.deepEqual(result.curves[0], before.curves[0]);
    close(
      Math.hypot(
        result.curves[1].b.x - result.curves[1].a.x,
        result.curves[1].b.y - result.curves[1].a.y,
      ),
      12,
    );
    await offsetDrag(page, 0, -2);
    result = await sketch(page);
    assert.equal(result.curves.length, 3);
    close(result.curves[2].a.y, 1);
    await chooseTool(page, "undo", "undo");
    assert.equal((await sketch(page)).curves.length, 2);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual(await sketch(page), result);
  }
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [6, 0]);
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  const original = await sketch(page);
  await number(page, -2);
  let result = await sketch(page);
  assert.equal(result.curves.length, 2);
  close(result.curves[1].radius, 4);
  assert.deepEqual(result.curves[0], original.curves[0]);
  await number(page, -4);
  assert.deepEqual(await sketch(page), result);
  assert.equal(
    await page.getByRole("textbox", { name: "Offset distance" }).getAttribute("aria-invalid"),
    "true",
  );
  await page.keyboard.press("Escape");
  await number(page, 0);
  assert.deepEqual(await sketch(page), result);
  await page.keyboard.press("Escape");
  await offsetDrag(page, 2, 0);
  result = await sketch(page);
  assert.equal(result.curves.length, 3);
  close(result.curves[2].radius, 6);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("6");
  await page.keyboard.press("Enter");
  close((await sketch(page)).curves[2].radius, 6);
  assert.deepEqual((await sketch(page)).curves[0], original.curves[0]);
  const saved = await sketch(page);
  await page.getByRole("button", { name: "Offset edge", exact: true }).click();
  await click(page, -20, -15);
  assert.deepEqual(await sketch(page), saved);
  await page.screenshot({ path: `.cache/sketch-review/${name}-offset.png` });
  await arcOffsets(page);
  console.log(
    `${name}: independent line/circle offsets, signed numeric/drag, locked source, editing, collapse/zero rejection, cancel and history passed`,
  );
}

/** @param {import("playwright").Page} page */
async function arcOffsets(page) {
  for (const height of [2, 8]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press("l");
    await drag(page, [-4, 0], [4, 0]);
    const guide = await overlayPoint(page, ".bow-handle", 1);
    const target = await at(page, 0, height);
    await page.mouse.move(guide.x, guide.y);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 8 });
    await page.mouse.up();
    await inspect(page);
    const source = (await sketch(page)).curves[0];
    assert.equal(source.kind, "arc");
    await number(page, 2);
    const result = await sketch(page),
      arc = result.curves[1];
    assert.equal(arc.kind, "arc");
    assert.deepEqual(result.curves[0], source);
    close(arc.bulge, source.bulge);
    pointEquals(arc.a, [-5.6, height === 2 ? 1.2 : -1.2]);
    pointEquals(arc.b, [5.6, height === 2 ? 1.2 : -1.2]);
    await page.getByRole("textbox", { name: "Radius", exact: true }).fill("8");
    await page.keyboard.press("Enter");
    assert.deepEqual((await sketch(page)).curves[0], source);
    await chooseTool(page, "undo", "undo");
    await chooseTool(page, "undo", "undo");
    assert.equal((await sketch(page)).curves.length, 1);
  }
}
