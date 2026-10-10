import assert from "node:assert/strict";
import { filletGuidePoint } from "../../tests/ui-fillet-guide-helpers.mjs";
import { at, overlayPoint } from "../../tests/ui-helpers.mjs";

export async function sketching(page, capture, a) {
  await a.tool("rectangle");
  await a.draw([-12, -8], [12, 8]);
  await a.tool("circle");
  await a.draw([0, 0], [4, 0]);
  await a.tool("select");
  // Bow the rectangle's lower edge into an arc while retaining its endpoints.
  await a.click([-6, -8, 0]);
  const bow = await a.run(() => overlayPoint(page, ".bow-handle", 0));
  const bowed = await a.run(() => at(page, 0, -12));
  await a.dragPixels(bow, bowed);
  let sketch = (await a.state()).document.sketches[0];
  assert.equal(sketch.curves.filter((curve) => curve.kind === "arc").length, 1);
  assert.equal(sketch.curves.filter((curve) => curve.kind === "circle").length, 1);
  await page.keyboard.press("Escape");
  await a.tool("select");
  await a.click([-12, 8, 0]);
  // Drag the actual corner guide, showing the fillet grow before release.
  const guide = await a.run(() => filletGuidePoint(page));
  const inset = 4 * (1 - 1 / Math.sqrt(2));
  const rounded = await a.run(() => at(page, -12 + inset, 8 - inset));
  await a.dragPixels(guide, rounded);
  sketch = (await a.state()).document.sketches[0];
  assert.equal(sketch.curves.filter((curve) => curve.kind === "arc").length, 2);
  assert.equal(sketch.curves.length, 6);
  await capture.hold(1.2);
}
