import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
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

const data = async (page) => (await inspect(page)).document.sketches[0];
export async function filletRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [0, 10], ["Shift"]); // Preserve explicit-link/constraint-loss fixtures.
  await page.keyboard.press("v");
  await click(page, 6, 0);
  await page.keyboard.down("Shift");
  await click(page, 0, 6);
  await page.keyboard.up("Shift");
  const original = await data(page);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  let sketch = await data(page);
  assert.equal(sketch.curves.length, 3);
  pointEquals(sketch.curves[0].a, [2, 0]);
  pointEquals(sketch.curves[1].a, [0, 2]);
  pointEquals(sketch.curves[0].b, [10, 0]);
  pointEquals(sketch.curves[1].b, [0, 10]);
  const arc = sketch.curves.find((c) => c.kind === "arc");
  assert.ok(arc);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("3");
  await page.keyboard.press("Enter");
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [3, 0]);
  pointEquals(sketch.curves[1].a, [0, 3]);
  const beforeInvalid = sketch;
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("-1");
  await page.keyboard.press("Enter");
  assert.deepEqual(await data(page), beforeInvalid);
  const invalidRadius = page.getByRole("textbox", { name: "Radius", exact: true });
  assert.equal(await invalidRadius.inputValue(), "-1");
  assert.equal(await invalidRadius.getAttribute("aria-invalid"), "true");
  assert.equal((await inspect(page)).interaction.kind, "numeric");
  assert.equal((await inspect(page)).interaction.phase, "editing");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.equal(await invalidRadius.inputValue(), "3");
  assert.deepEqual(await data(page), beforeInvalid);
  await undoTo(page, original);
  await page.keyboard.press("v");
  await click(page, 20, 15);
  await click(page, 6, 0);
  await page.keyboard.down("Shift");
  await click(page, 0, 6);
  await page.keyboard.up("Shift");
  const handle = await filletGuidePoint(page);
  const to = await at(page, 4 * (1 - 1 / Math.sqrt(2)), 4 * (1 - 1 / Math.sqrt(2)));
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  // The shallow guide can already lie near radius 4. Cross the drag threshold
  // before returning to the requested radius, rather than producing a click.
  await page.mouse.move(handle.x + 12, handle.y - 12, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [4, 0]);
  pointEquals(sketch.curves[1].a, [0, 4]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-fillet.png` });
  // Reselection, rather than creation state, must retain fillet radius semantics.
  await click(page, 20, 15);
  await click(page, 4 * (1 - 1 / Math.sqrt(2)), 4 * (1 - 1 / Math.sqrt(2)));
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  await inspect(page);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("5");
  await page.keyboard.press("Enter");
  sketch = await data(page);
  pointEquals(sketch.curves[0].a, [5, 0]);
  close(sketch.constraints.find((c) => c.kind === "radius").value, 5);
  await filletMovement(page, sketch);
  console.log(
    `${name}: fillet create/type/drag, radius reselection/lock/edit, invalid-radius rejection and Undo passed`,
  );
}

async function filletMovement(page, beforeMove) {
  // Select the whole arc away from its midpoint handle for a rigid group move.
  await click(page, 3, 5 - Math.sqrt(21));
  await page.keyboard.down("Shift");
  await click(page, 6, 0);
  await click(page, 0, 6);
  await page.keyboard.up("Shift");
  assert.equal((await inspect(page)).selection.length, 3);
  assert.deepEqual((await data(page)).constraints, beforeMove.constraints);
  await drag(page, [6, 0], [8, 2], ["Shift"]);
  const sketch = await data(page);
  // WebKit rounds the pointer-down pixel on an arbitrary edge. Grid snapping
  // places that grabbed point on the grid, so test rigid motion and pointer-scale
  // accuracy rather than assuming an exactly representable initial grab.
  const dx = sketch.curves[0].b.x - beforeMove.curves[0].b.x;
  const dy = sketch.curves[0].b.y - beforeMove.curves[0].b.y;
  const { camera } = await inspect(page);
  const viewport = await page.getByLabel("Modeling viewport").boundingBox();
  assert.ok(
    Math.abs(dx - 2) < camera.height / viewport.height &&
      Math.abs(dy - 2) < camera.height / viewport.height,
  );
  for (const old of beforeMove.curves) {
    const moved = sketch.curves.find((c) => c.id === old.id);
    pointEquals(moved.a, [old.a.x + dx, old.a.y + dy]);
    pointEquals(moved.b, [old.b.x + dx, old.b.y + dy]);
    if (old.kind === "arc") close(moved.bulge, old.bulge);
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual(await data(page), beforeMove);
}

export async function filletLossRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [10, 0]);
  await page.getByRole("button", { name: "Lock Length", exact: true }).click();
  await inspect(page);
  await page.getByRole("button", { name: "Constrain horizontal", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [0, 10], ["Shift"]); // Preserve explicit-link/constraint-loss fixtures.
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await page.getByRole("button", { name: "Fuse selected points", exact: true }).click();
  await inspect(page);
  await page.keyboard.press("Escape");
  await click(page, 20, 15);
  await click(page, 6, 0);
  await page.keyboard.down("Shift");
  await click(page, 0, 6);
  await page.keyboard.up("Shift");
  const original = await data(page);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Escape");
  assert.deepEqual(await data(page), original);
  await chooseTool(page, "fillet sketch", "sketch-fillet");
  await page.getByRole("textbox", { name: "Fillet radius", exact: true }).fill("2");
  await page.keyboard.press("Enter");
  assert.equal(
    await page.getByRole("button", { name: "Remove and fillet", exact: true }).count(),
    0,
  );
  await inspect(page);
  assert.match(await page.getByRole("status").textContent(), /constraint.*removed.*Undo/);
  let result = await data(page);
  assert.equal(result.curves.length, 3);
  assert.ok(result.constraints.some((c) => c.kind === "horizontal"));
  assert.ok(!result.constraints.some((c) => c.kind === "length"));
  const handle = await page.locator(".bow-handle").boundingBox();
  // Use an off-bisector point on radius 4, matching the active 2 mm radius grid.
  const p = await at(page, 1.6, 0.8);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
  result = await data(page);
  pointEquals(result.curves[0].a, [4, 0]);
  pointEquals(result.curves[1].a, [0, 4]);
  await page.getByRole("button", { name: "Lock Radius", exact: true }).click();
  await inspect(page);
  const beforeLocked = await data(page);
  const lockedHandle = await page.locator(".bow-handle").boundingBox();
  const q = await at(page, 6 * (1 - 1 / Math.sqrt(2)), 6 * (1 - 1 / Math.sqrt(2)));
  await page.mouse.move(
    lockedHandle.x + lockedHandle.width / 2,
    lockedHandle.y + lockedHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 8 });
  await page.mouse.up();
  assert.deepEqual(
    await data(page),
    beforeLocked,
    "A locked-radius drag must not tilt the supporting lines",
  );
  await undoTo(page, original);
  console.log(
    `${name}: fillet automatic constraint removal, notice/cancel, support preservation, existing-radius drag and lock rejection passed`,
  );
}

async function undoTo(page, target) {
  for (let i = 0; i < 8; i++) {
    await chooseTool(page, "undo", "undo");
    if (isDeepStrictEqual(await data(page), target)) return;
  }
  assert.deepEqual(await data(page), target);
}
