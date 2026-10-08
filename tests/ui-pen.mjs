import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { at, click, close, drag, inspect, overlayPoint, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function sketch(page) {
  return (await inspect(page)).document.sketches[0];
}
async function enter(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "Pen", "pen");
}
async function finish(page) {
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
}
async function handle(page, curve, key, to, modifiers = []) {
  const h = await overlayPoint(page, `[data-curve="${curve}"][data-handle="${key}"]`);
  const p = await at(page, ...to);
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(p.x, p.y, { steps: 8 });
  await page.mouse.up();
  for (const modifier of modifiers) await page.keyboard.up(modifier);
  await inspect(page);
}

async function straightPath(page, name) {
  await enter(page);
  await click(page, -20, -10);
  assert.equal(
    (await inspect(page)).document.sketches.length,
    0,
    "a lone anchor creates no document geometry",
  );
  await click(page, 0, -10);
  await click(page, 0, 10);
  await click(page, -20, -10);
  const s = await sketch(page);
  assert.equal(s.curves.length, 3);
  assert.ok(s.curves.every((c) => c.kind === "segment"));
  assert.equal(s.constraints.filter((c) => c.kind === "coincident").length, 3);
  assert.equal((await inspect(page)).interaction, null, "start-anchor click closes the path");
  await chooseTool(page, "undo", "undo");
  assert.equal((await sketch(page)).curves.length, 2);
  await chooseTool(page, "redo", "redo");
  assert.equal((await sketch(page)).curves.length, 3);
  console.log(`${name}: pen straight path, closure and Undo/Redo passed`);
}

async function smoothPath(page, name) {
  await enter(page);
  await drag(page, [-20, 0], [-16, 6]);
  await drag(page, [0, 0], [6, 10]);
  await drag(page, [20, 0], [26, 6]);
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/pen-${name}.png` });
  await finish(page);
  let s = await sketch(page);
  assert.equal(s.curves.length, 2);
  assert.ok(s.curves.every((c) => c.kind === "bezier"));
  assert.equal(s.constraints.filter((c) => c.kind === "tangent").length, 1);
  const [first, second] = s.curves;
  close(first.c1.x, -16);
  close(first.c1.y, 6);
  close(first.c2.x, -6);
  close(first.c2.y, -10);
  close(second.c1.x, 6);
  close(second.c1.y, 10);
  await page.keyboard.press("v");
  await click(page, 0, 0);
  await handle(page, second.id, "c1", [8, 8]);
  s = await sketch(page);
  const changed = s.curves.find((c) => c.id === first.id);
  close(changed.c2.x, changed.c2.y, "smooth handles remain collinear");
  await handle(page, second.id, "c1", [6, 10], ["Alt"]);
  s = await sketch(page);
  assert.equal(s.constraints.filter((c) => c.kind === "tangent").length, 0);
  close(s.curves.find((c) => c.id === first.id).c2.x, changed.c2.x);
  await drag(page, [0, 0], [0, 6]);
  s = await sketch(page);
  close(s.curves[0].b.y, 6);
  close(s.curves[1].a.y, 6);
  console.log(`${name}: pen smooth joins, handle editing, Alt break and fused movement passed`);
}

async function smoothClosure(page, name) {
  await enter(page);
  await drag(page, [-20, 0], [-16, 6]);
  await drag(page, [0, 10], [6, 16]);
  await drag(page, [20, 0], [26, 6]);
  await click(page, -20, 0);
  await inspect(page);
  const s = await sketch(page);
  assert.equal(s.curves.length, 3);
  assert.equal(s.constraints.filter((c) => c.kind === "coincident").length, 3);
  assert.equal(s.constraints.filter((c) => c.kind === "tangent").length, 3);
  assert.equal((await inspect(page)).interaction, null);
  const path = resolve(`.cache/sketch-review/pen-${name}.makeshift`);
  await saveDocument(page, path);
  await reset(page);
  await openDocument(page, path);
  assert.deepEqual(await sketch(page), s, "saved pen curves and constraints reopen unchanged");
  console.log(`${name}: smooth closed pen path retains all three tangencies`);
}

async function cornerPath(page, name) {
  await enter(page);
  await click(page, -20, 0);
  await drag(page, [0, 0], [6, 10], ["Alt"]);
  await click(page, 20, 0);
  await finish(page);
  const s = await sketch(page);
  assert.equal(s.curves[0].kind, "segment");
  assert.equal(s.curves[1].kind, "bezier");
  assert.equal(s.constraints.filter((c) => c.kind === "tangent").length, 0);
  await page.keyboard.press("p");
  await drag(page, [-20, -20], [-15, -10]);
  await click(page, -20, -20);
  await click(page, 0, -20);
  await finish(page);
  assert.equal(
    (await sketch(page)).curves.at(-1).kind,
    "segment",
    "clicking last anchor retracts the outgoing handle",
  );
  console.log(`${name}: pen corner creation and outgoing-handle retraction passed`);
}

async function attachmentPath(page, name) {
  await enter(page);
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [0, 0]);
  await page.keyboard.press("p");
  await click(page, 0, 0);
  await click(page, 20, 10);
  await finish(page);
  const s = await sketch(page);
  assert.equal(s.constraints.filter((c) => c.kind === "coincident").length, 1);
  await page.keyboard.press("p");
  await click(page, -10, 0);
  await click(page, -10, 15);
  await finish(page);
  assert.equal(
    (await sketch(page)).constraints.filter((c) => c.kind === "point-on-edge").length,
    1,
  );
  await page.keyboard.press("p");
  await page.keyboard.down("Shift");
  await click(page, 0, 0);
  await page.keyboard.up("Shift");
  await click(page, 20, -10);
  await finish(page);
  assert.equal(
    (await sketch(page)).constraints.filter((c) => c.kind === "coincident").length,
    1,
    "Shift suppresses attachment",
  );
  console.log(`${name}: pen endpoint/edge coincidence and Shift snap suppression passed`);
}

async function freePath(page, name) {
  await enter(page);
  await click(page, -20, 0);
  await chooseTool(page, "Toggle grid snapping", "grid");
  await page.keyboard.down("Shift");
  await click(page, -7.3, 12.7);
  await page.keyboard.up("Shift");
  await finish(page);
  let s = await sketch(page);
  close(s.curves[0].b.x + 20, s.curves[0].b.y, "Shift locks anchor direction to 45 degrees");
  await page.keyboard.press("p");
  await page.keyboard.down("Shift");
  await click(page, 3.17, -9.23);
  await page.keyboard.up("Shift");
  await click(page, 12.43, -4.81);
  await finish(page);
  s = await sketch(page);
  // WebKit rounds pointer input to whole screen pixels.
  const origin = await at(page, 0, 0),
    unit = await at(page, 1, 0);
  const pixel = 1 / Math.hypot(unit.x - origin.x, unit.y - origin.y);
  for (const [actual, expected] of [
    [s.curves[1].a.x, 3.17],
    [s.curves[1].a.y, -9.23],
    [s.curves[1].b.x, 12.43],
    [s.curves[1].b.y, -4.81],
  ])
    assert.ok(Math.abs(actual - expected) <= pixel, `${actual} != ${expected}`);
  await page.keyboard.press("p");
  await drag(page, [-20, -20], [-17, -14], ["Shift"]);
  await click(page, 0, -20);
  await finish(page);
  s = await sketch(page);
  close(
    s.curves[2].c1.x - s.curves[2].a.x,
    s.curves[2].c1.y - s.curves[2].a.y,
    "Shift locks handles to 45 degrees",
  );
  console.log(`${name}: grid toggle mid-path, free placement and direction modifiers passed`);
}

async function gridDirections(page, name) {
  await enter(page);
  await drag(page, [-20, 0], [-15, 9], ["Shift"]);
  await page.keyboard.down("Shift");
  await click(page, 1, 16);
  await page.keyboard.up("Shift");
  await finish(page);
  const curve = (await sketch(page)).curves[0];
  assert.equal(curve.kind, "bezier");
  close(curve.b.x - curve.a.x, curve.b.y - curve.a.y);
  close(curve.c1.x - curve.a.x, curve.c1.y - curve.a.y);
  const grid = (await page.getByRole("status").textContent()).match(/([\d.]+) mm grid on/);
  assert.ok(grid, "Pen reports its active grid spacing");
  const spacing = Number(grid[1]);
  for (const p of [curve.a, curve.b, curve.c1]) {
    close(p.x / spacing, Math.round(p.x / spacing));
    close(p.y / spacing, Math.round(p.y / spacing));
  }
  console.log(`${name}: Shift direction locking retains grid placement`);
}

async function lifecyclePath(page, name) {
  await enter(page);
  await click(page, -20, 0);
  await click(page, 0, 0);
  await inspect(page);
  await page.keyboard.press("v");
  assert.equal((await inspect(page)).interaction, null);
  assert.equal((await sketch(page)).curves.length, 1);
  await page.keyboard.press("p");
  await click(page, 10, 10);
  await page.keyboard.press("Escape");
  assert.equal((await sketch(page)).curves.length, 1);
  const a = await at(page, 10, 10),
    b = await at(page, 15, 15);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await inspect(page)).interaction, null);
  assert.equal((await sketch(page)).curves.length, 1, "Escape discards a held tangent gesture");
  await page.keyboard.press("v");
  await click(page, -10, 0);
  await page.keyboard.press("Delete");
  assert.equal((await sketch(page)).curves.length, 0);
  await page.keyboard.press("p");
  await click(page, -20, 0);
  const end = await at(page, 0, 0);
  await page.mouse.dblclick(end.x, end.y);
  await page.waitForFunction(() => window.makeshiftInspect().interaction === null);
  assert.equal(
    (await sketch(page)).curves.length,
    1,
    "double-click finishes without a duplicate span",
  );
  console.log(`${name}: pen tool switching, cancellation, reselection and Delete passed`);
}

export async function penRoute(page, name) {
  await straightPath(page, name);
  await smoothPath(page, name);
  await smoothClosure(page, name);
  await cornerPath(page, name);
  await attachmentPath(page, name);
  await freePath(page, name);
  await gridDirections(page, name);
  await lifecyclePath(page, name);
}
