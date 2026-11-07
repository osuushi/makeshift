import assert from "node:assert/strict";
import { at, inspect } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// A captured document contains no sketch until the drawing gesture commits.
// Check actual GPU ink during that missing-capture interval as well as afterwards.
export async function sectionFaceSketch(page) {
  await chooseTool(page, "cross section", "cross-section");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await chooseTool(page, "Sketch on face", "sketch-on-face");
  const before = (await inspect(page)).document.sketches.length;
  const point = await at(page, 9 / Math.sqrt(2), 9 / Math.sqrt(2));
  const baseline = await darkest(page, point);
  await page.keyboard.press("c");
  const a = await at(page, 0, 0),
    b = await at(page, 9, 0);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  assert.equal((await inspect(page)).document.sketches.length, before);
  assert.ok(
    (await darkest(page, point)) < baseline - 40,
    "Temporary circle ink remains above the cap",
  );
  await page.screenshot({ path: ".cache/sketch-review/section-face-circle-drag.png" });
  await page.mouse.up();
  await inspect(page);
  await page.keyboard.press("Escape");
  assert.equal((await inspect(page)).document.sketches.length, before + 1);
  assert.ok(
    (await darkest(page, point)) < baseline - 40,
    "Accepted circle ink remains above the cap",
  );
  await page.mouse.click(point.x, point.y);
  assert.equal((await inspect(page)).selectedCurves.length, 1);
  await chooseTool(page, "undo", "undo");
}
async function darkest(page, point) {
  const png = await page.screenshot({
    clip: { x: Math.round(point.x) - 3, y: Math.round(point.y) - 3, width: 6, height: 6 },
  });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 6;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, 6, 6).data;
    return Math.min(...Array.from({ length: 36 }, (_, i) => rgba[i * 4]));
  }, png.toString("base64"));
}
