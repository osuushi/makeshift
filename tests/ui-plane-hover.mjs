import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { captureTestFrame } from "./ui-test-frames.mjs";

export async function planeHover(page, xyz, name) {
  const before = await inspect(page);
  await page.getByRole("button", { name: "Application settings" }).hover();
  const baseline = await canvasFrame(page);
  const point = await project(page, xyz);
  await page.mouse.move(point.x, point.y);
  const highlighted = await canvasFrame(page);
  assert.equal(
    (await inspect(page)).modelingHover,
    null,
    "Reference hover replaces ordinary edge/face hover",
  );
  assert.equal(highlighted === baseline, false, "Hover visibly highlights the pickable reference");
  assert.deepEqual((await inspect(page)).document, before.document, "Hover does not edit geometry");
  await page.screenshot({ path: `.cache/plane-probe/${name}-hover.png` });
  await page.getByRole("button", { name: "Application settings" }).hover();
  const cleared = await canvasFrame(page);
  assert.equal(cleared, baseline, "Leaving restores every GPU canvas pixel");
  await page.mouse.move(point.x, point.y);
}

async function canvasFrame(page) {
  await captureTestFrame(page);
  // Element screenshots also capture translucent HTML over the canvas. Their
  // backdrop-filter rasterization can differ after hover even with identical GPU
  // pixels. Compare the actual preserved WebGL bitmap, without a tolerance.
  return page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    return document.querySelector("canvas").toDataURL();
  });
}
