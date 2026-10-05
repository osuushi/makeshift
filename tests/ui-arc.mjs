import assert from "node:assert/strict";
import { arcControlsClear } from "./ui-arc-controls.mjs";
import { orient } from "./ui-blend-edit.mjs";
import { pixels, tinted } from "./ui-fill.mjs";
import {
  at,
  click,
  close,
  drag,
  inspect,
  overlayPoint,
  pointEquals,
  reset,
} from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const curves = async (page) => (await inspect(page)).document.sketches.flatMap((s) => s.curves);
const radiusOf = (arc) =>
  (Math.hypot(arc.b.x - arc.a.x, arc.b.y - arc.a.y) * (1 + arc.bulge ** 2)) /
  (4 * Math.abs(arc.bulge));
async function radius(page, value) {
  await page.getByRole("textbox", { name: "Radius", exact: true }).fill(String(value));
  await page.keyboard.press("Enter");
  await inspect(page);
}
async function guide(page, side) {
  return overlayPoint(page, ".bow-handle", side > 0 ? 1 : 0);
}
async function bow(page, side, target) {
  const a = await guide(page, side),
    b = await at(page, ...target);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await inspect(page);
}
export async function arcRoute(page, name) {
  await reset(page);
  for (const plane of ["XY", "XZ", "YZ"]) {
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("l");
    await drag(page, [-4, 0], [4, 0]);
    assert.equal(await page.locator(".bow-guide").count(), 2);
    if (plane === "XY")
      await page.screenshot({ path: `.cache/sketch-review/${name}-arc-guides.png` });
    await bow(page, 1, [0, 2]);
    let arc = (await curves(page)).at(-1);
    assert.equal(arc.kind, "arc");
    close(arc.bulge, -0.5);
    pointEquals(arc.a, [-4, 0]);
    pointEquals(arc.b, [4, 0]);
    close(radiusOf(arc), 5);
    await radius(page, 6);
    close(radiusOf((await curves(page)).at(-1)), 6);
    const before = (await inspect(page)).document;
    await radius(page, 3);
    assert.deepEqual((await inspect(page)).document, before);
    await chooseTool(page, "undo", "undo");
    close(radiusOf((await curves(page)).at(-1)), 5);
    await chooseTool(page, "undo", "undo");
    assert.equal((await curves(page)).at(-1).kind, "segment");
    await page.keyboard.press("v");
    await click(page, 2, 0);
    // Click the guide off its midpoint handle: the faint curve itself is a target.
    const guidePoints = await page.locator(".bow-guide").first().getAttribute("points");
    const pairs = guidePoints.split(" ").map((p) => p.split(",").map(Number));
    const [gx, gy] = pairs[Math.floor(pairs.length * 0.3)];
    const g = { x: gx, y: gy };
    await page.mouse.click(g.x, g.y);
    assert.equal(
      await page
        .getByRole("textbox", { name: "Radius", exact: true })
        .evaluate((e) => e === document.activeElement),
      true,
    );
    await page.keyboard.type("5");
    await page.keyboard.press("Enter");
    arc = (await curves(page)).at(-1);
    close(arc.bulge, 0.5);
    // Existing arc bow can pass beyond a semicircle, retaining endpoints.
    await bow(page, -1, [0, -8]);
    arc = (await curves(page)).at(-1);
    close(arc.bulge, 2);
    close(radiusOf(arc), 5);
    await radius(page, 4);
    close((await curves(page)).at(-1).bulge, 1);
    await radius(page, 6);
    assert.ok((await curves(page)).at(-1).bulge > 1);
    // Cancel a held bow without losing the accepted arc.
    const saved = (await inspect(page)).document;
    const handle = await guide(page, -1),
      dest = await at(page, 0, 3);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(dest.x, dest.y, { steps: 5 });
    await page.keyboard.press("Escape");
    await page.mouse.up();
    assert.deepEqual((await inspect(page)).document, saved);
    await page.keyboard.press("v");
    await arcControlsClear(page, plane);
    await drag(page, [-4, 0], [-6, 0]);
    arc = (await curves(page)).at(-1);
    pointEquals(arc.a, [-6, 0]);
    pointEquals(arc.b, [4, 0]);
    const moved = (await inspect(page)).document;
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, saved);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, moved);
    await orient(page, [0.5, 0.5, 1]);
    await page.waitForFunction(() => window.makeshiftInspect().activePlane === null);
  }
  await mixedArc(page, name);
  console.log(
    `${name}: bow/click-radius, minor/major, fixed endpoints, cancel/rejection/Undo and arc editing passed`,
  );
}
async function mixedArc(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  const blank = await pixels(page, [[0.3, 0.8]]);
  await page.keyboard.press("l");
  await drag(page, [-4, 0], [4, 0]);
  await bow(page, 1, [0, 2]);
  await page.keyboard.press("l");
  await drag(page, [4, 0], [-4, 0]);
  await page.keyboard.press("Escape");
  tinted(blank[0], (await pixels(page, [[0.3, 0.8]]))[0]);
  // A shallow lens needs a smaller feasible fillet hint at its shared endpoint.
  await page.keyboard.press("v");
  await click(page, -4, 0);
  await page.getByRole("button", { name: "Round corner", exact: true }).waitFor();
  // Shared endpoint co-drag, followed by mixed rigid translation.
  await drag(page, [-4, 0], [-6, 0]);
  let data = await curves(page);
  pointEquals(data[0].a, [-6, 0]);
  pointEquals(data[1].b, [-6, 0]);
  await click(page, 20, 15);
  await drag(page, [-10, -5], [10, 8]);
  assert.equal((await inspect(page)).selection.length, 2);
  // Grab the whole edge away from its midpoint and the local rotation ring.
  const beforeMove = await curves(page);
  await drag(page, [2.5, 0], [2.5, 3]);
  data = await curves(page);
  const dy = data[0].a.y - beforeMove[0].a.y;
  assert.ok(dy > 0);
  pointEquals(data[0].a, [beforeMove[0].a.x, beforeMove[0].a.y + dy]);
  pointEquals(data[1].b, [beforeMove[1].b.x, beforeMove[1].b.y + dy]);
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("45");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.screenshot({ path: `.cache/sketch-review/${name}-arc.png` });
  const saved = (await inspect(page)).document;
  await chooseTool(page, "delete", "delete");
  assert.equal((await curves(page)).length, 0);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, saved);
  await page.reload();
  assert.deepEqual((await inspect(page)).document, saved);
}
