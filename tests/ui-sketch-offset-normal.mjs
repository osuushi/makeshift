import assert from "node:assert/strict";
import { at, click, close, drag, inspect, modalCompleted, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The panel grip, post-layout SVG orientation, pointer capture and click-away
// acceptance meet in the renderer; geometry-only tests cannot catch this boundary.
export async function sketchOffsetNormalRoute(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await chooseTool(page, "toggle grid snapping", "grid");
  const before = (await inspect(page)).document;
  const handle = page.getByRole("button", { name: "Offset loop", exact: true });
  const input = page.getByRole("textbox", { name: "Offset distance", exact: true });
  await relocate(page, handle, [0, 20]);
  await assertArrow(page, handle, [0, 1]);
  await relocate(page, handle, [32, 0]);
  await assertArrow(page, handle, [1, 0]);
  await dragOffset(page, handle, [2, 3]);
  close(Number(await input.inputValue()), 2);
  assert.deepEqual((await inspect(page)).document, before, "Release keeps the preview temporary");
  await click(page, 0, 16);
  await modalCompleted(page);
  const after = (await inspect(page)).document;
  assert.equal(after.sketches[0].curves.length, 8);
  for (const c of after.sketches[0].curves.slice(4)) {
    close(Math.abs(c.a.x), 12);
    close(Math.abs(c.a.y), 8);
  }
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, after);
  await handle.click();
  await input.fill("3");
  await inspect(page);
  await dragOffset(page, handle, [-1, 2]);
  close(Number(await input.inputValue()), 2, "Inward drag reduces the current typed offset");
  await page.keyboard.press("Escape");
  await modalCompleted(page);
  assert.deepEqual((await inspect(page)).document, after);
  await handle.click();
  await input.fill("0");
  await click(page, 0, 16);
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  assert.equal((await inspect(page)).interaction.kind, "offset");
  assert.deepEqual((await inspect(page)).document, after);
  const outside = await at(page, 0, 16);
  await input.fill("1");
  // Click without waiting for the native solve: acceptance must flush the latest value.
  await page.mouse.click(outside.x, outside.y);
  await modalCompleted(page);
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 12);
  console.log(
    "Sketch Offset: relocated nearest-normal glyph, outward/tangent/inward drag, click-away, invalid recovery and Undo/Redo passed",
  );
}

async function relocate(page, handle, local) {
  const target = await at(page, ...local);
  const box = await handle.boundingBox();
  const grip = await page.locator(".offset-control .parameter-panel-grip").boundingBox();
  const x = grip.x + grip.width / 2,
    y = grip.y + grip.height / 2;
  assert.equal(
    await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest(".offset-control")?.className,
      { x, y },
    ),
    await page.locator(".offset-control").getAttribute("class"),
    "Move the offset grip through its actual pointer target",
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(
    x + target.x - box.x - box.width / 2,
    y + target.y - box.y - box.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();
  const moved = await handle.boundingBox();
  assert.ok(
    Math.hypot(moved.x + moved.width / 2 - target.x, moved.y + moved.height / 2 - target.y) < 1,
    "The offset handle must reach the requested panel position",
  );
}

async function assertArrow(page, handle, local) {
  const a = await at(page, 0, 0),
    b = await at(page, ...local);
  const path = handle.locator('path[data-contour="0"]').first();
  const axis = await path.evaluate((path) => {
    const a = path.getPointAtLength(0),
      b = path.getPointAtLength(path.getTotalLength());
    return { x: b.x - a.x, y: b.y - a.y };
  });
  const similarity =
    (axis.x * (b.x - a.x) + axis.y * (b.y - a.y)) /
    Math.hypot(axis.x, axis.y) /
    Math.hypot(b.x - a.x, b.y - a.y);
  assert.ok(similarity > 0.999, `Displayed arrow must follow the nearest normal: ${similarity}`);
}

async function dragOffset(page, handle, delta) {
  const a = await at(page, 0, 0),
    b = await at(page, ...delta);
  const box = await handle.boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  assert.equal(
    await page.evaluate(
      ({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".sketch-offset-handle"),
      { x, y },
    ),
    true,
    "The relocated handle must have a clear pointer target",
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + b.x - a.x, y + b.y - a.y, { steps: 6 });
  await page.mouse.up();
  await inspect(page);
}
