import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { at, drag, inspect, overlayPoint, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { widgetPresentation } from "./ui-widget-presentation.mjs";

const field = (page, name) => page.getByRole("textbox", { name, exact: true });
const button = (page, name) => page.getByRole("button", { name, exact: true });
const near = (a, b, tolerance = 1e-3) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
async function spherePoint(page) {
  return (await widgetPresentation(page, "Position extrusion axis")).virtual;
}
async function moveSphere(page, target, cancel = false, bypass = false) {
  const p = (await widgetPresentation(page, "Position extrusion axis")).displayed;
  if (bypass) await page.keyboard.down("Meta");
  await page.mouse.move(p.x, p.y);
  const { offset } = await widgetPresentation(page, "Position extrusion axis");
  await page.mouse.down();
  await page.mouse.move(target.x + offset.x, target.y + offset.y, { steps: 5 });
  if (cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (bypass) await page.keyboard.up("Meta");
}
export async function extrudeTwistRoute(page, name) {
  page.setDefaultTimeout(120000);
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -10], [10, 10]);
  let center = await at(page, 0, 0),
    corner = await at(page, 10, 10);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const before = (await inspect(page)).document;
  await twistPlacement(page);
  center = await project(page, [0, 0, 0]);
  corner = await project(page, [10, 10, 0]);
  await moveSphere(page, corner);
  near((await spherePoint(page)).x, corner.x, 0.1);
  near((await spherePoint(page)).y, corner.y, 0.1);
  let state = await inspect(page);
  assert.equal(state.preview, null);
  assert.deepEqual(state.document, before, "Zero-twist positioning is UI-only");
  await moveSphere(page, center, true);
  near((await spherePoint(page)).x, corner.x, 0.1);
  await field(page, "Extrusion distance").fill("20");
  await inspect(page);
  await field(page, "Extrusion twist").fill("90");
  state = await inspect(page);
  assert.ok(state.preview?.bodies?.length, await page.getByRole("status").textContent());
  near(state.preview.bodies[0].volume, 8000);
  assert.deepEqual(state.document, before);
  await twistDragControls(page, center, corner);
  await page.getByRole("combobox", { name: "Draft measurement" }).selectOption("offset");
  await field(page, "Draft value").fill("1");
  state = await inspect(page);
  near(state.preview.bodies[0].volume, (20 * (400 + 440 + 484)) / 3);
  await liveUpdates(page);
  await field(page, "Extrusion twist").fill("bad");
  assert.equal((await inspect(page)).preview, null);
  assert.ok(await button(page, "Accept extrusion").isDisabled());
  await field(page, "Extrusion twist").fill("90");
  await field(page, "Extrusion distance").fill("20");
  await inspect(page);
  await page.keyboard.press("Enter");
  await orient(page, [1, -1, 0.8]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-extrude-twist.png` });
  await button(page, "Accept extrusion").click();
  const accepted = (await inspect(page)).document;
  near(accepted.bodies[0].volume, (20 * (400 + 440 + 484)) / 3);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  near((await inspect(page)).document.bodies[0].volume, accepted.bodies[0].volume);
  await bodyArchiveRoute(page, `${name}-twist`);
  // Re-select the exact cap and enter a subsequent extrusion, then cancel it.
  await orient(page, [0, 0, 1]);
  const cap = await project(page, [20, 0, 20]);
  await page.mouse.click(cap.x, cap.y);
  await page.keyboard.press("e");
  await field(page, "Extrusion distance").fill("5");
  await inspect(page);
  await button(page, "Cancel extrusion").click();
  near((await inspect(page)).document.bodies[0].volume, accepted.bodies[0].volume);
  console.log(
    `${name}: axis placement, twist drag, live cancellation, history, archive and cap re-edit passed`,
  );
}

async function twistPlacement(page) {
  for (const direction of [
    [0, 0, 1],
    [1, -1, 0.8],
    [-1, 1, 0.8],
  ]) {
    await orient(page, direction);
    const origin = await spherePoint(page);
    const handle = button(page, "Drag extrusion twist");
    const { virtual } = await widgetPresentation(page, "Drag extrusion twist");
    const worldOrigin = await project(page, [0, 0, 0]);
    near(origin.x, worldOrigin.x, 0.1);
    near(origin.y, worldOrigin.y, 0.1);
    near(virtual.x, origin.x - 72, 0.1);
    near(virtual.y, origin.y, 0.1);
    await handle.hover();
    assert.equal(
      await handle.evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgba(0, 0, 0, 0)",
    );
  }
  await orient(page, [0, 0, 1]);
}

async function twistDragControls(page, center, corner) {
  await page.keyboard.press("Enter");
  const anchor = await project(page, [10, 10, 0]);
  const start = await button(page, "Drag extrusion twist").evaluate((handle) => {
    const path = handle.querySelector("path");
    const points = [0.1, 0.4, 0.7, 0.9].map((t) => {
      const p = path.getPointAtLength(path.getTotalLength() * t);
      return new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
    });
    for (const p of points)
      if (!handle.contains(document.elementFromPoint(p.x, p.y)))
        throw new Error("Visible twist glyph must take precedence over underlying geometry");
    return { x: points[1].x, y: points[1].y };
  });
  await page.mouse.move(start.x, start.y);
  const { offset } = await widgetPresentation(page, "Drag extrusion twist");
  const dx = start.x - offset.x - anchor.x,
    dy = start.y - offset.y - anchor.y,
    radians = Math.PI / 6;
  await page.mouse.down();
  await page.mouse.move(
    anchor.x + dx * Math.cos(radians) - dy * Math.sin(radians) + offset.x,
    anchor.y + dx * Math.sin(radians) + dy * Math.cos(radians) + offset.y,
    { steps: 8 },
  );
  await page.mouse.up();
  await inspect(page);
  near(Number(await field(page, "Extrusion twist").inputValue()), 60, 1);
  await field(page, "Extrusion twist").fill("90");
  await inspect(page);
  // Cancelling an axis gesture while native work runs restores the earlier axis.
  await moveSphere(page, center, true, true);
  await inspect(page);
  near((await spherePoint(page)).x, corner.x, 0.1);
  near((await spherePoint(page)).y, corner.y, 0.1);
}

async function liveUpdates(page) {
  await field(page, "Extrusion twist").fill("450");
  const live = await page.evaluate(async () => {
    const start = performance.now();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { elapsed: performance.now() - start, solving: window.makeshiftInspect().solving };
  });
  assert.ok(live.elapsed < 1000, "Repainting must continue during the native sweep");
  assert.ok(live.solving, "Exercise a genuinely running native sweep");
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(20, 30);
  // Supersede actual native work through ordinary typing, without awaiting it.
  await field(page, "Extrusion twist").fill("-60");
  await field(page, "Extrusion distance").fill("-15");
  const state = await inspect(page);
  near(state.preview.bodies[0].volume, (15 * (400 + 440 + 484)) / 3);
  assert.ok(
    (await page.evaluate(() => window.makeshiftHistory())).some(
      (entry) => entry.outcome === "cancelled",
    ),
    "Input changes cancel actual obsolete native calculations",
  );
}

export async function cubicTwistRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("b");
  await drag(page, [0, 0], [10, 0]);
  const drawn = await inspect(page);
  assert.equal(drawn.document.sketches[0]?.curves[0]?.kind, "bezier");
  for (const [key, target] of [
    ["c1", [0, 10]],
    ["c2", [10, 10]],
  ]) {
    const handle = await overlayPoint(page, `[data-handle="${key}"][data-curve]`);
    const point = await at(page, ...target);
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(point.x, point.y, { steps: 8 });
    await page.mouse.up();
    await inspect(page);
  }
  await page.keyboard.press("l");
  await drag(page, [10, 0], [0, 0]);
  const center = await at(page, 5, 3);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  await field(page, "Extrusion distance").fill("10");
  await inspect(page);
  await field(page, "Extrusion twist").fill("90");
  near((await inspect(page)).preview.bodies[0].volume, 600);
  await page.getByRole("combobox", { name: "Draft measurement" }).selectOption("offset");
  for (const offset of [0.5, -0.5]) {
    await field(page, "Draft value").fill(String(offset));
    const state = await inspect(page);
    assert.ok(state.preview?.bodies?.length, await page.getByRole("status").textContent());
    assert.ok((state.preview.bodies[0].volume - 600) * offset > 0);
  }
  await orient(page, [1, -1, 0.8]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-cubic-twist.png` });
  await button(page, "Accept extrusion").click();
  const accepted = (await inspect(page)).document;
  assert.equal(accepted.bodies.length, 1);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  near((await inspect(page)).document.bodies[0].volume, accepted.bodies[0].volume);
  console.log(`${name}: drawn cubic profile twists with expanding/contracting draft and history`);
}
