import assert from "node:assert/strict";
import {
  at,
  click,
  close,
  corners,
  inspect,
  modalCompleted,
  pointEquals,
  reset,
  settled,
} from "./ui-helpers.mjs";
import { rotatedHandles } from "./ui-rotated-handles.mjs";
import { chooseTool } from "./ui-tools.mjs";

// WebKit truncates fractional CSS coordinates; round our chosen pixels explicitly.
// At the route's integer pixel/mm scale this also removes solved-coordinate noise.
async function drag(page, from, to, modifiers = []) {
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  const a = await at(page, ...from),
    b = await at(page, ...to);
  await page.mouse.move(Math.round(a.x), Math.round(a.y));
  await page.mouse.down();
  await page.mouse.move(Math.round(b.x), Math.round(b.y), { steps: 8 });
  await page.mouse.up();
  for (const modifier of modifiers) await page.keyboard.up(modifier);
  await settled(page);
}

async function rectangleEditing(page, name) {
  await reset(page);
  assert.equal(await page.getByRole("button", { name: "Rectangle (R)" }).isVisible(), false);
  await page.keyboard.press("r");
  assert.equal((await inspect(page)).activePlane, null, "R must not choose a plane");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await drag(page, [0, 0], [20, 10]);
  pointEquals((await corners(page))[2], [20, 10]);
  assert.equal(await page.getByRole("textbox", { name: "Width", exact: true }).inputValue(), "20");
  // These edits assert exact odd coordinates; displacement-grid behavior has its own route.
  await chooseTool(page, "grid snap", "grid");
  await page.keyboard.press("Escape");
  assert.equal(
    (await inspect(page)).document.sketches[0].curves.length,
    4,
    "Dismissal retains geometry",
  );
  await click(page, 10, 5);
  await drag(page, [10, 5], [15, 12]);
  let points = await corners(page);
  pointEquals(points[0], [5, 7]);
  pointEquals(points[2], [25, 17]);
  await click(page, 5, 12);
  await drag(page, [5, 12], [2, 12]);
  points = await corners(page);
  pointEquals(points[0], [2, 7]);
  pointEquals(points[1], [25, 7]);
  await click(page, 13.5, 17);
  await drag(page, [13.5, 17], [13.5, 20]);
  points = await corners(page);
  pointEquals(points[2], [25, 20]);
  pointEquals(points[0], [2, 7]);
  await click(page, 25, 13.5);
  await drag(page, [25, 13.5], [28, 13.5]);
  points = await corners(page);
  pointEquals(points[2], [28, 20]);
  pointEquals(points[0], [2, 7]);
  await click(page, 15, 7);
  await drag(page, [15, 7], [15, 4]);
  points = await corners(page);
  pointEquals(points[0], [2, 4]);
  pointEquals(points[2], [28, 20]);
  for (const [index, dx, dy] of [
    [0, -2, -1],
    [1, 3, -1],
    [2, 3, 2],
    [3, -1, 3],
  ]) {
    const before = await corners(page),
      p = before[index],
      opposite = before[(index + 2) % 4];
    await click(page, p.x, p.y);
    await drag(page, [p.x, p.y], [p.x + dx, p.y + dy]);
    const after = await corners(page);
    pointEquals(after[index], [p.x + dx, p.y + dy]);
    pointEquals(after[(index + 2) % 4], [opposite.x, opposite.y]);
  }
  await rectangleDimensionsAndHistory(page, name);
}

async function rectangleDimensionsAndHistory(page, name) {
  let points;
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("40");
  await page.keyboard.press("Tab");
  await settled(page);
  assert.equal(
    await page
      .getByRole("textbox", { name: "Height", exact: true })
      .evaluate((el) => el === document.activeElement),
    true,
  );
  await page.getByRole("textbox", { name: "Height", exact: true }).fill("24");
  await page.keyboard.press("Enter");
  points = await corners(page);
  close(points[1].x - points[0].x, 40);
  close(points[3].y - points[0].y, 24);
  const beforeInvalid = JSON.stringify((await inspect(page)).document);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("0");
  await page.keyboard.press("Enter");
  assert.equal(JSON.stringify((await inspect(page)).document), beforeInvalid);
  const invalidWidth = page.getByRole("textbox", { name: "Width", exact: true });
  assert.equal(await invalidWidth.inputValue(), "0");
  assert.equal(await invalidWidth.getAttribute("aria-invalid"), "true");
  assert.equal((await inspect(page)).interaction.kind, "numeric");
  assert.equal((await inspect(page)).interaction.phase, "editing");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.equal(await invalidWidth.inputValue(), "40");
  assert.equal(JSON.stringify((await inspect(page)).document), beforeInvalid);
  await chooseTool(page, "undo", "undo");
  points = await corners(page);
  assert.notEqual(points[3].y - points[0].y, 24);
  await chooseTool(page, "redo", "redo");
  assert.equal(JSON.stringify((await inspect(page)).document), beforeInvalid);
  const center = [(points[0].x + points[2].x) / 2, (points[0].y + points[2].y) / 2];
  await click(page, ...center);
  await page.screenshot({ path: `.cache/sketch-review/${name}-rectangle.png` });
  await chooseTool(page, "clear sketch", "clear-sketch");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 0);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
}

async function planesAndCancellation(page) {
  // Separate fresh routes ensure vertical planes use local coordinates identically.
  for (const plane of ["XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await chooseTool(page, "grid snap", "grid");
    await page.keyboard.press("r");
    await drag(page, [-10, -5], [10, 5]);
    await click(page, -10, 0);
    await drag(page, [-10, 0], [-13, 0]);
    pointEquals((await corners(page))[0], [-13, -5]);
    await click(page, -1.5, 5);
    await drag(page, [-1.5, 5], [-1.5, 8]);
    pointEquals((await corners(page))[2], [10, 8]);
    await page.getByRole("textbox", { name: "Angle", exact: true }).fill("30");
    await page.keyboard.press("Enter");
    await rotatedHandles(page);
  }
  // Grid off plus Shift allows a fractional position without geometry attraction.
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await chooseTool(page, "grid snap", "grid");
  await page.evaluate(() =>
    window.addEventListener(
      "pointerup",
      (event) => {
        window.lastPointer = { x: event.clientX, y: event.clientY };
      },
      { once: true },
    ),
  );
  await drag(page, [0, 0], [10.25, 6.4], ["Shift"]);
  const fractional = await corners(page);
  const delivered = await page.evaluate(() => window.lastPointer);
  const projection = (await inspect(page)).projection;
  close(
    fractional[2].x,
    (delivered.x - projection.origin.x) / (projection.u.x - projection.origin.x),
  );
  close(
    fractional[2].y,
    (delivered.y - projection.origin.y) / (projection.v.y - projection.origin.y),
  );
  assert.notEqual(
    fractional[2].x,
    Math.round(fractional[2].x),
    "Grid toggle disables grid quantization",
  );
  const beforeCancel = JSON.stringify((await inspect(page)).document),
    start = await at(page, 5, 3);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 40, start.y + 20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal(JSON.stringify((await inspect(page)).document), beforeCancel);
}

export async function numericDuringDrag(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  const start = await at(page, -20, 0),
    end = await at(page, -10, 6);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  assert.equal(
    (await inspect(page)).document.sketches.length,
    0,
    "A held gesture is still temporary",
  );
  assert.equal(await page.getByRole("textbox", { name: "Width", exact: true }).inputValue(), "10");
  await page.keyboard.type("15");
  await page.keyboard.press("Tab");
  await settled(page);
  await page.keyboard.type("8");
  await page.keyboard.press("Enter");
  await page.mouse.up();
  pointEquals((await corners(page))[0], [-20, 0]);
  pointEquals((await corners(page))[2], [-5, 8]);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 0, "Typed drag is one Undo step");
}

export async function rectangleRoute(page, name) {
  const viewport =
    page.viewportSize() ??
    (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  // Exact integer-coordinate assertions need pixel-aligned input when grid is off.
  // At the initial 80 mm view, an 800 px canvas gives 10 CSS pixels per mm.
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await rectangleEditing(page, name);
    await planesAndCancellation(page);
    await numericDuringDrag(page);
    console.log(
      `${name}: rectangle creation, dismissal, move, sides/corners, dimensions, history, Clear, planes and Shift passed`,
    );
  } finally {
    await page.setViewportSize(viewport);
  }
}
