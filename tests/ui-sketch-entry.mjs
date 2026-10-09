import assert from "node:assert/strict";
import { at, close, drag, reset } from "./ui-helpers.mjs";
import { assertNavigation, navigationHistory, navigationIdle } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function doubleClickEntry(page, reducedMotion) {
  await page.emulateMedia({ reducedMotion });
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await navigationIdle(page);
  await page.keyboard.press("c");
  await drag(page, [0, 0], [10, 0]);
  const drawn = await navigationIdle(page);
  assert.equal(drawn.document.sketches[0].curves[0].kind, "circle");
  await chooseTool(page, "Return to Modeling", "modeling");
  await page.locator('.orientation-cube [data-kind="corner"]:visible').first().click();
  const oblique = await navigationIdle(page);
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  // The circle's center is the world origin, retained as the camera target.
  await page.mouse.dblclick(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20);
  const entered = await navigationIdle(page);
  assert.equal(entered.activeSketch, drawn.document.sketches[0].id);
  const [x, y, z] = entered.camera.position.map((n, i) => n - entered.camera.target[i]);
  assert.ok(Math.hypot(x, y) < 1e-6, `Camera aligns with XY normal: ${x}, ${y}, ${z}`);
  assert.deepEqual(entered.modelingSelection, []);
  assert.deepEqual(entered.selectionTargets, [], "Entry does not also select sketch curves");
  assert.deepEqual(entered.document, drawn.document);
  const undone = await navigationHistory(page);
  assert.equal(undone.activePlane, null, "Undo returns to Modeling");
  for (const key of ["position", "target", "up"])
    undone.camera[key].forEach((n, i) => {
      close(n, oblique.camera[key][i], `Undo camera ${key}`);
    });
  assert.deepEqual(undone.document, drawn.document);
  assertNavigation(await navigationHistory(page, true), entered, "Redo sketch entry");

  const point = await at(page, 4, 3);
  await page.mouse.dblclick(point.x, point.y);
  const selected = await navigationIdle(page);
  assert.deepEqual(selected.selectedCurves, [drawn.document.sketches[0].curves[0].id]);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("12");
  await page.keyboard.press("Enter");
  close((await navigationIdle(page)).document.sketches[0].curves[0].radius, 12);
  close((await navigationHistory(page)).document.sketches[0].curves[0].radius, 10);
  close((await navigationHistory(page, true)).document.sketches[0].curves[0].radius, 12);
}

export async function sketchEntryRoute(page, name) {
  try {
    for (const motion of ["no-preference", "reduce"]) await doubleClickEntry(page, motion);
  } finally {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  console.log(
    `${name}: circle double-click camera entry, reduced motion, selection, radius edit and Undo/Redo passed`,
  );
}
