import assert from "node:assert/strict";
import { inspect } from "./ui-helpers.mjs";

export async function blockedDuringDrawing(page) {
  await page.keyboard.press("l");
  const bounds = await page.locator("canvas").boundingBox();
  assert.ok(bounds, "The drawing canvas is visible");
  // Earlier pinch checks change the world-space scale. Keep the entire pointer
  // gesture inside the canvas regardless of that scale or browser rounding.
  const start = { x: bounds.x + bounds.width * 0.7, y: bounds.y + bounds.height * 0.7 };
  const end = { x: start.x + 40, y: start.y + 30 };
  for (const point of [start, end])
    assert.equal(
      await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, point),
      "CANVAS",
      "The drawing gesture must target the unobstructed canvas",
    );
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  const before = await inspect(page);
  assert.equal(
    before.interaction?.kind,
    "pointer",
    "Start a real drawing gesture in the visible viewport",
  );
  await page.mouse.wheel(80, 50);
  await page.keyboard.down("Alt");
  await page.mouse.wheel(80, 50);
  await page.keyboard.up("Alt");
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -30);
  await page.keyboard.up("Control");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  assert.deepEqual(
    (await inspect(page)).camera,
    before.camera,
    "Pan/pinch cannot move the camera during a modeling drag",
  );
  await page.keyboard.press("Escape");
  await page.mouse.up();
}
