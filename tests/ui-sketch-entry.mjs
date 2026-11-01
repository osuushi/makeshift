import assert from "node:assert/strict";
import { faceSketchEntryRoute } from "./ui-face-sketch-entry.mjs";
import { at, close, drag, reset } from "./ui-helpers.mjs";
import { assertNavigation, navigationHistory, navigationIdle } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function doubleClickEntry(page, reducedMotion, zoomedIn) {
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
  await navigationIdle(page);
  const box = await page.locator("canvas").boundingBox();
  assert.ok(box);
  if (zoomedIn) {
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -150);
    await page.keyboard.up("Control");
    await page.waitForFunction(() => window.makeshiftInspect().camera.height < 20);
  }
  const oblique = await navigationIdle(page);
  // The close case looks at an off-center part of the profile.
  await page.mouse.dblclick(box.x + box.width / 2 + 20, box.y + box.height / 2 + 20);
  const entered = await navigationIdle(page);
  assert.equal(entered.activeSketch, drawn.document.sketches[0].id);
  if (zoomedIn) close(entered.camera.height, oblique.camera.height, "Entry retains close zoom");
  else assert.ok(entered.camera.height < oblique.camera.height, "Entry still zooms in to fit");
  const planeDistance = oblique.camera.position[2] - oblique.camera.target[2];
  for (let i = 0; i < 3; i++) {
    const expected = zoomedIn
      ? oblique.camera.target[i] -
        (oblique.camera.target[2] * (oblique.camera.position[i] - oblique.camera.target[i])) /
          planeDistance
      : 0;
    close(
      entered.camera.target[i],
      expected,
      zoomedIn ? "Entry keeps viewed area" : "Entry fits profile",
    );
  }
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
  close(undone.camera.height, oblique.camera.height, "Undo restores zoom");
  assert.deepEqual(undone.document, drawn.document);
  assertNavigation(await navigationHistory(page, true), entered, "Redo sketch entry");

  // Retained close zoom can crop the circle; keep the subsequent interior pick visible.
  const point = await at(
    page,
    entered.camera.target[0] + Math.min(4, entered.camera.height / 4),
    entered.camera.target[1] + Math.min(3, entered.camera.height / 4),
  );
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
    for (const motion of ["no-preference", "reduce"])
      for (const zoomedIn of [false, true]) await doubleClickEntry(page, motion, zoomedIn);
    await faceSketchEntryRoute(page);
  } finally {
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  console.log(
    `${name}: profile/face entry retains viewed area at close zoom; far fitting, reduced motion, radius edit and Undo/Redo passed`,
  );
}
