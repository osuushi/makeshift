import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument, saveDocument } from "./native-documents.mjs";
import { filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function acuteHintRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [20, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [20, 2], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 16, 0);
  await page.keyboard.down("Shift");
  await click(page, 16, 1.6);
  await page.keyboard.up("Shift");
  await click(page, 0, 0);
  await inspect(page);
  const before = await filletGuidePoint(page);
  const origin = await at(page, 0, 0);
  const height = (await inspect(page)).camera.height;
  await page.mouse.move(origin.x, origin.y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await page.waitForFunction((h) => window.makeshiftInspect().camera.height < h, height);
  await inspect(page);
  const after = await filletGuidePoint(page);
  const newOrigin = await at(page, 0, 0);
  const ratio = height / (await inspect(page)).camera.height;
  assert.ok(ratio > 1.1);
  assert.ok(
    Math.abs(
      Math.hypot(after.x - newOrigin.x, after.y - newOrigin.y) /
        Math.hypot(before.x - origin.x, before.y - origin.y) -
        ratio,
    ) < 0.03,
    "Zoom enlarges the hint instead of shrinking its world radius",
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-fillet-acute-hint.png` });
  await page.mouse.click(after.x, after.y);
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill("0.4");
  await page.keyboard.press("Enter");
  assert.ok((await inspect(page)).document.sketches[0].curves.some((c) => c.kind === "arc"));
}

export async function filletCursorRoute(page, name) {
  await acuteHintRoute(page, name);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [0, 0], [15, 0]);
  await page.keyboard.press("l");
  await drag(page, [0, 0], [0, 15], ["Shift"]);
  await page.keyboard.press("v");
  await click(page, 10, 0);
  await page.keyboard.down("Shift");
  await click(page, 0, 10);
  await page.keyboard.up("Shift");
  const original = (await inspect(page)).document;
  const handle = await filletGuidePoint(page);
  // Radius 6 at an off-bisector point (2.4,1.2); midpoint projection chooses ~4.35.
  const target = await at(page, 2.4, 1.2);
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x + 20, handle.y, { steps: 3 });
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await page.mouse.up();
  const rounded = (await inspect(page)).document;
  const arc = rounded.sketches[0].curves.find((c) => c.kind === "arc");
  assert.ok(arc);
  assert.ok(Math.abs(arc.a.x - 6) < 1e-6 && Math.abs(arc.b.y - 6) < 1e-6);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, rounded);
  const path = resolve(`.cache/sketch-review/${name}-fillet-cursor.makeshift`);
  await saveDocument(page, path);
  await reset(page);
  await page.waitForFunction(() => window.makeshiftInspect().document.sketches.length === 0);
  await openDocument(page, path);
  await page.waitForFunction(
    (id) => window.makeshiftInspect().document.sketches[0]?.id === id,
    rounded.sketches[0].id,
  );
  assert.deepEqual((await inspect(page)).document, { ...rounded, bodies: rounded.bodies ?? [] });
  await page.screenshot({ path: `.cache/sketch-review/${name}-fillet-cursor.png` });
  console.log(
    `${name}: acute hint zoom/click, off-bisector arc drag and Undo/Redo and Save/Open passed`,
  );
}
