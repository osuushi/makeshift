import assert from "node:assert/strict";
import { orient } from "./ui-blend-edit.mjs";
import { circleFeedback } from "./ui-circle-feedback.mjs";
import {
  at,
  click,
  close,
  drag,
  inspect,
  modalCompleted,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const circles = async (page) =>
  (await inspect(page)).document.sketches.flatMap((s) =>
    s.curves.filter((c) => c.kind === "circle"),
  );
async function radius(page, value) {
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
export async function circleRoute(page, name) {
  await reset(page);
  assert.equal(
    await page.getByRole("button", { name: "Circle (C)", exact: true }).isVisible(),
    false,
  );
  await page.keyboard.press("c");
  assert.equal((await inspect(page)).activePlane, null);
  for (const plane of ["XY", "XZ", "YZ"]) {
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await chooseTool(page, "circle", "circle");
    await drag(page, [0, 0], [8, 0]);
    assert.equal((await inspect(page)).tool, "circle");
    close((await circles(page)).at(-1).radius, 8);
    await page.keyboard.press("Escape");
    await click(page, 0, 0);
    await drag(page, [0, 0], [-6, -4]);
    let circle = (await circles(page)).at(-1);
    pointEquals(circle.center, [-6, -4]);
    close(circle.radius, 8);
    // Circumference can resize from left and top; center remains anchored.
    await drag(page, [-14, -4], [-16, -4]);
    close((await circles(page)).at(-1).radius, 10);
    await drag(page, [-6, 6], [-6, 8]);
    close((await circles(page)).at(-1).radius, 12);
    await radius(page, 6);
    circle = (await circles(page)).at(-1);
    pointEquals(circle.center, [-6, -4]);
    close(circle.radius, 6);
    const before = (await inspect(page)).document;
    await radius(page, -1);
    assert.deepEqual((await inspect(page)).document, before);
    const input = page.getByRole("textbox", { name: "Radius", exact: true });
    assert.equal(await input.inputValue(), "-1");
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    assert.equal((await inspect(page)).interaction.kind, "numeric");
    await page.keyboard.press("Escape");
    await modalCompleted(page);
    assert.deepEqual((await inspect(page)).document, before);
    await chooseTool(page, "undo", "undo");
    close((await circles(page)).at(-1).radius, 12);
    await chooseTool(page, "redo", "redo");
    close((await circles(page)).at(-1).radius, 6);
    await orient(page, [0.5, 0.5, 1]);
    await page.waitForFunction(() => window.makeshiftInspect().activePlane === null);
  }
  await page.reload();
  assert.equal((await circles(page)).length, 3);
  await mixedAndSnaps(page);
  await circleFeedback(page);
  await heldCircle(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-circle.png` });
  console.log(
    `${name}: circles on all planes, center move, left/top radius, numeric rejection/history, mixed transforms, snaps and held-drag editing passed`,
  );
}

async function mixedAndSnaps(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [0, 0], [5, 0]);
  const initialRadius = (await inspect(page)).document.sketches[0].curves[0].radius;
  assert.ok(initialRadius > 0);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [15, -10]);
  await page.keyboard.press("v");
  await drag(page, [0, 0], [-3, 2]);
  let sketch = (await inspect(page)).document.sketches[0];
  const movedCenter = sketch.curves[0].center;
  assert.ok(movedCenter.x < 0 && movedCenter.y > 0);
  pointEquals(sketch.curves[1].a, [movedCenter.x, movedCenter.y]);
  close(sketch.curves[0].radius, initialRadius);
  await page.keyboard.press("r");
  await drag(page, [10, 5], [20, 15]);
  await page.keyboard.press("v");
  await click(page, -25, -20);
  await drag(page, [-12, -13], [25, 20]); // Box includes circle, line and rectangle.
  assert.equal((await inspect(page)).selection.length, 6);
  // Explicit Move retains the box selection when grabbing a point within it.
  const beforeMove = (await inspect(page)).document.sketches[0].curves;
  await page.keyboard.press("m");
  await drag(page, [movedCenter.x, movedCenter.y], [movedCenter.x + 2, movedCenter.y + 2]);
  sketch = (await inspect(page)).document.sketches[0];
  const dx = sketch.curves[0].center.x - movedCenter.x;
  const dy = sketch.curves[0].center.y - movedCenter.y;
  assert.ok(dx > 0 && dy > 0);
  pointEquals(sketch.curves[1].b, [beforeMove[1].b.x + dx, beforeMove[1].b.y + dy]);
  pointEquals(sketch.curves[2].a, [beforeMove[2].a.x + dx, beforeMove[2].a.y + dy]);
  close(sketch.curves[0].radius, initialRadius);
  const rotation = (await inspect(page)).rotationHandle;
  await page.mouse.click(rotation.x, rotation.y);
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("90");
  await page.keyboard.press("Enter");
  close((await circles(page))[0].radius, initialRadius);
  await chooseTool(page, "delete", "delete");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 6);
  await chooseTool(page, "clear sketch", "clear-sketch");
  assert.equal((await circles(page)).length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal((await circles(page)).length, 1);
}

async function heldCircle(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  const a = await at(page, 0, 0),
    b = await at(page, 8, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("12");
  await page.keyboard.press("Enter");
  await page.mouse.up();
  close((await circles(page))[0].radius, 12);
  await page.keyboard.press("c");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await circles(page)).length, 1);
}
