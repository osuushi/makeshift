import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { bodyArchiveRoute } from "./ui-body-archive.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { at, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { relativeOffsetInput } from "./ui-offset-input.mjs";
import { orientableArrowViews } from "./ui-orientable-tools.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function dragHandle(page, handle, dx, dy) {
  const b = await handle.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps: 6 });
  await page.mouse.up();
  return inspect(page);
}
export async function orientableFaceOffsetRoute(page, name, app) {
  const { center } = await plate(page);
  await page.mouse.click(center.x + 35, center.y + 35);
  const original = (await inspect(page)).document;
  const handle = page.getByRole("button", { name: "Offset faces", exact: true });
  const input = await relativeOffsetInput(page);
  assert.equal(await handle.locator("svg").getAttribute("data-tool-shape"), "offset");
  await orientableArrowViews(
    page,
    handle,
    page.locator(".face-offset-widget"),
    [0, 0, 1],
    `${name}-offset-rigid`,
  );
  await input.fill("2");
  close((await inspect(page)).preview.bodies[0].volume, 4800);
  await input.fill("-100");
  await inspect(page);
  assert.equal(await handle.getAttribute("data-geometry-invalid"), "true");
  assert.deepEqual((await inspect(page)).document, original);
  await input.fill("2");
  await inspect(page);
  assert.equal(await handle.getAttribute("data-geometry-invalid"), "false");
  await page.getByRole("button", { name: "Cancel face offset", exact: true }).click();
  assert.deepEqual((await inspect(page)).document, original);
  const a = await project(page, [0, 0, 10]),
    b = await project(page, [0, 0, 12]);
  const preview = await dragHandle(page, handle, b.x - a.x, b.y - a.y);
  close(preview.preview.bodies[0].volume, 4800);
  assert.deepEqual(preview.document, original);
  await page.getByRole("button", { name: "Accept face offset", exact: true }).click();
  const accepted = (await inspect(page)).document;
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, original);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, accepted);
  await bodyArchiveRoute(page, `${name}-orientable-offset`, app);
  const reopened = (await inspect(page)).document;
  await orient(page, [0, 0, 1]);
  const top = await project(page, [4, 4, 12]);
  await page.mouse.click(top.x, top.y);
  await (await relativeOffsetInput(page)).fill("2");
  close((await inspect(page)).preview.bodies[0].volume, 5600);
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, reopened);
  console.log(
    `${name}: face offset glyph, projected drag, invalid recovery, cancel, accept, history, archive and re-edit passed`,
  );
}

export async function orientableSketchOffsetRoute(page, name) {
  for (const plane of ["XY", "XZ", "YZ"]) {
    await reset(page);
    await chooseTool(page, `Sketch on ${plane}`, `sketch-${plane.toLowerCase()}`);
    await page.keyboard.press("l");
    await drag(page, [-10, 0], [10, 0]);
    const original = (await inspect(page)).document;
    const handle = page.getByRole("button", { name: "Offset edge", exact: true });
    const input = page.getByRole("textbox", { name: "Offset distance", exact: true });
    await handle.click();
    await input.fill("2");
    await inspect(page);
    await page.keyboard.press("Escape");
    assert.deepEqual((await inspect(page)).document, original);
    const a = await at(page, 0, 0),
      b = await at(page, 0, 2);
    await dragHandle(page, handle, b.x - a.x, b.y - a.y);
    const accepted = (await inspect(page)).document;
    assert.equal(accepted.sketches[0].curves.length, 2);
    close(accepted.sketches[0].curves[1].a.y, 2);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
    await chooseTool(page, "redo", "redo");
    assert.deepEqual((await inspect(page)).document, accepted);
    // CSS hit areas and the released numeric session must both allow a new drag.
    // Model-only coverage cannot catch a field intercepting the handle's pointer.
    await handle.click();
    await input.fill("1");
    await inspect(page);
    const fieldBox = await input.boundingBox(),
      handleBox = await handle.boundingBox();
    assert.ok(fieldBox.x >= handleBox.x + handleBox.width + 4);
    await dragHandle(page, handle, b.x - a.x, b.y - a.y);
    const resumed = (await inspect(page)).document;
    close(resumed.sketches[0].curves.at(-1).a.y, 5);
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, accepted);
    await page.keyboard.press("v");
    const reselect = await at(page, 4, 2);
    await page.mouse.click(reselect.x, reselect.y);
    await handle.click();
    await input.fill("-2");
    await page.keyboard.press("Enter");
    close((await inspect(page)).document.sketches[0].curves.at(-1).a.y, 0);
    await page.screenshot({ path: `.cache/sketch-review/${name}-sketch-offset-${plane}.png` });
  }
  await sketchLoopAndCircle(page);
  console.log(
    `${name}: sketch offset on XY/XZ/YZ, line/circle/loop, pointer/typed, cancellation and history passed`,
  );
}

async function sketchLoopAndCircle(page) {
  for (const kind of ["circle", "loop"]) {
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await page.keyboard.press(kind === "circle" ? "c" : "r");
    await drag(page, kind === "circle" ? [0, 0] : [-10, -6], kind === "circle" ? [6, 0] : [10, 6]);
    const original = (await inspect(page)).document;
    await page
      .getByRole("button", { name: kind === "circle" ? "Offset edge" : "Offset loop", exact: true })
      .click();
    await page.getByRole("textbox", { name: "Offset distance", exact: true }).fill("2");
    await page.keyboard.press("Enter");
    const curves = (await inspect(page)).document.sketches[0].curves;
    if (kind === "circle") close(curves[1].radius, 8);
    else {
      assert.equal(curves.length, 8);
      const ends = curves.slice(4).flatMap((c) => [c.a, c.b]);
      close(Math.max(...ends.map((p) => p.x)) - Math.min(...ends.map((p) => p.x)), 24);
      close(Math.max(...ends.map((p) => p.y)) - Math.min(...ends.map((p) => p.y)), 16);
    }
    await chooseTool(page, "undo", "undo");
    assert.deepEqual((await inspect(page)).document, original);
  }
}
