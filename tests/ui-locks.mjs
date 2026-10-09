import assert from "node:assert/strict";
import { pixels } from "./ui-fill.mjs";
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

const sketch = async (page) => (await inspect(page)).document.sketches[0];
const locks = async (page) => (await sketch(page)).constraints.filter((c) => "curve" in c);
async function number(page, name, value) {
  await page.getByRole("textbox", { name, exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
async function start(page, tool, a, b) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press(tool);
  await drag(page, a, b);
}
async function button(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await inspect(page);
}
export async function lockRoute(page, name) {
  await start(page, "l", [0, 0], [10, 0]);
  await number(page, "Length", 11);
  assert.equal((await locks(page)).length, 0, "Typing alone does not lock");
  await page.getByRole("textbox", { name: "Length", exact: true }).fill("12");
  const lockBox = await page
    .getByRole("button", { name: "Lock Length", exact: true })
    .boundingBox();
  // Exactly one pointer click; locator retries must not conceal a lost blur/lock click.
  await page.mouse.click(lockBox.x + lockBox.width / 2, lockBox.y + lockBox.height / 2);
  close((await locks(page))[0]?.value, 12);
  await page.getByRole("group", { name: "Selected entity constraints" }).waitFor();
  await page.keyboard.press("v");
  const saved = (await inspect(page)).document;
  await drag(page, [12, 0], [15, 0]);
  assert.deepEqual((await inspect(page)).document, saved, "Conflicting endpoint drag rejected");
  await number(page, "Length", 14);
  close((await locks(page))[0].value, 14);
  await drag(page, [7, 0], [10, 4]);
  pointEquals((await sketch(page)).curves[0].a, [4, 4]);
  await number(page, "Angle", 90);
  pointEquals((await sketch(page)).curves[0].b, [4, 18]);
  // Constraint cues remain quiet until one entity is selected.
  await click(page, 20, 15);
  assert.equal(await page.locator(".constraint-list").isVisible(), false);
  const purple = (await pixels(page, [[4, 11]]))[0];
  assert.ok(
    purple[0] > purple[1] + 15 && purple[2] > purple[1] + 15,
    `${purple} constrained purple`,
  );
  await click(page, 4, 11);
  const remove = page.getByRole("button", { name: "Remove Length 14 mm constraint", exact: true });
  await remove.hover();
  const amber = (await pixels(page, [[4, 8]], false))[0];
  assert.ok(amber[0] > amber[2] + 40, `${amber} related curve highlight`);
  await page.screenshot({ path: `.cache/sketch-review/${name}-constraints.png` });
  await remove.click();
  await inspect(page);
  assert.equal((await locks(page)).length, 0);
  await chooseTool(page, "undo", "undo");
  close((await locks(page))[0].value, 14);
  await click(page, 4, 9);
  await button(page, "Remove Length 14 mm constraint");
  assert.equal((await locks(page)).length, 0);
  await drag(page, [4, 18], [6, 18]);
  pointEquals((await sketch(page)).curves[0].b, [6, 18]);
  await button(page, "Lock Length");
  const locked = (await inspect(page)).document;
  await chooseTool(page, "delete", "delete");
  assert.equal((await sketch(page)).constraints.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, locked);
  await page.reload();
  assert.deepEqual((await inspect(page)).document, locked);
  await heldLock(page);
  await rectangleLocks(page);
  await radiusLocks(page);
  console.log(
    `${name}: explicit length/radius locks, edits, drag rejection, quiet cues, hover/removal and Undo passed`,
  );
}
async function rectangleLocks(page) {
  await start(page, "r", [0, 0], [10, 6]);
  await button(page, "Lock Width");
  await page.keyboard.press("v");
  const saved = (await inspect(page)).document;
  await drag(page, [0, 3], [-2, 3]);
  assert.deepEqual((await inspect(page)).document, saved);
  await number(page, "Height", 8);
  await number(page, "Width", 12);
  close((await locks(page))[0].value, 12);
  await button(page, "Unlock Width");
  assert.equal((await locks(page)).length, 0);
  close((await sketch(page)).curves[0].a.x, -2, "Width edit keeps opposite edge at 10");
  await drag(page, [-2, 4], [-4, 4]);
  close((await sketch(page)).curves[0].a.x, -4);
}
async function radiusLocks(page) {
  await start(page, "c", [0, 0], [5, 0]);
  await button(page, "Lock Radius");
  await number(page, "Radius", 6);
  close((await locks(page))[0].value, 6);
  await page.keyboard.press("v");
  const saved = (await inspect(page)).document;
  await drag(page, [6, 0], [8, 0]);
  assert.deepEqual((await inspect(page)).document, saved);
  await drag(page, [0, 0], [2, 2]);
  pointEquals((await sketch(page)).curves[0].center, [2, 2]);
  await button(page, "Unlock Radius");
  await drag(page, [8, 2], [10, 2]);
  close((await sketch(page)).curves[0].radius, 8);
  await start(page, "l", [-4, 0], [4, 0]);
  await page.keyboard.press("v");
  await click(page, -2, 0);
  const box = await page.locator(".bow-handle").first().boundingBox();
  assert.ok(box, "Selected line exposes its bow handle");
  const target = await at(page, 0, -8);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
  await button(page, "Lock Radius");
  await number(page, "Radius", 6);
  const arc = (await sketch(page)).curves[0];
  assert.ok(Math.abs(arc.bulge) > 1, "Major branch preserved");
  close((await locks(page))[0].value, 6);
  const accepted = (await inspect(page)).document;
  await number(page, "Radius", 3);
  assert.deepEqual(
    (await sketch(page)).curves[0],
    arc,
    "Impossible radius retains geometry and lock",
  );
  close((await locks(page))[0].value, 6);
  const input = page.getByRole("textbox", { name: "Radius", exact: true });
  assert.equal(await input.inputValue(), "3");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal((await inspect(page)).interaction.kind, "numeric");
  await button(page, "Unlock Radius");
  await modalCompleted(page);
  const unlocked = (await inspect(page)).document;
  assert.deepEqual(unlocked.sketches[0].curves, accepted.sketches[0].curves);
  assert.equal(
    (await locks(page)).length,
    0,
    "Unlock cancels the invalid draft before removing the lock",
  );
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, unlocked);
  await number(page, "Radius", 5);
  assert.equal((await locks(page)).length, 0);
}

async function heldLock(page) {
  await start(page, "l", [0, 0], [10, 0]);
  await button(page, "Lock Length");
  await page.keyboard.press("v");
  const a = await at(page, 10, 0),
    b = await at(page, 12, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.keyboard.type("15");
  await page.keyboard.press("Enter");
  await page.mouse.up();
  close((await locks(page))[0].value, 15);
  pointEquals((await sketch(page)).curves[0].b, [15, 0]);
  await chooseTool(page, "undo", "undo");
  close((await locks(page))[0].value, 10);
  pointEquals((await sketch(page)).curves[0].b, [10, 0]);
}
