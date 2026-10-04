import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { captureTestFrame } from "./ui-test-frames.mjs";

export async function planeHover(page, xyz, name) {
  const before = await inspect(page);
  await page.mouse.move(30, 35);
  const canvas = page.locator("canvas");
  await captureTestFrame(page);
  const baseline = await canvas.screenshot();
  const point = await project(page, xyz);
  await page.mouse.move(point.x, point.y);
  await captureTestFrame(page);
  const highlighted = await canvas.screenshot();
  assert.equal(
    (await inspect(page)).modelingHover,
    null,
    "Reference hover replaces ordinary edge/face hover",
  );
  assert.equal(
    highlighted.equals(baseline),
    false,
    "Hover visibly highlights the pickable reference",
  );
  assert.deepEqual((await inspect(page)).document, before.document, "Hover does not edit geometry");
  await page.screenshot({ path: `.cache/plane-probe/${name}-hover.png` });
  await page.mouse.move(30, 35);
  await captureTestFrame(page);
  assert.equal(
    (await canvas.screenshot()).equals(baseline),
    true,
    "Leaving clears the reference highlight",
  );
  await page.mouse.move(point.x, point.y);
}
