import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { clickFilletGuide, filletGuidePoint } from "./ui-fillet-guide-helpers.mjs";
import { at, click, close, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function filletGuideRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  const ring = (await inspect(page)).rotationHandle;
  await page.mouse.click(ring.x, ring.y);
  await page.getByRole("textbox", { name: "Angle", exact: true }).fill("25");
  await page.keyboard.press("Enter");
  const original = (await inspect(page)).document;
  const points = original.sketches[0].curves.map((c) => c.a);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("v");
    await click(page, points[i].x, points[i].y);
    const selection = await inspect(page);
    assert.equal(await page.locator('button[data-action="fillet"]').count(), 0);
    assert.equal(
      await page.getByRole("textbox", { name: "Fillet radius", exact: true }).isVisible(),
      false,
    );
    assert.equal(await page.locator(".fillet-guide").getAttribute("opacity"), "0.35");
    assert.deepEqual(selection.document, original, "Showing a guide does not edit the document");
    if (i === 0) {
      await page.screenshot({ path: `.cache/sketch-review/${name}-fillet-guide.png` });
      const held = await filletGuidePoint(page);
      await page.mouse.move(held.x, held.y);
      await page.mouse.down();
      await page.keyboard.press("Escape");
      await page.mouse.up();
      assert.deepEqual((await inspect(page)).document, original);
      await clickFilletGuide(page);
      const accepted = (await inspect(page)).document;
      assert.equal(accepted.sketches[0].curves.length, 5);
      assert.equal(await page.locator(".fillet-control").isVisible(), false);
      assert.ok(await page.getByRole("textbox", { name: "Radius", exact: true }).isVisible());
      // Pointer-down must use the radius grid even without crossing the drag threshold.
      const radius = Number(
        await page.getByRole("textbox", { name: "Radius", exact: true }).inputValue(),
      );
      const step = accepted.sketchGrid?.minor ?? 0.5;
      close(radius / step, Math.round(radius / step));
      await click(page, 30, 20);
      assert.deepEqual((await inspect(page)).document, accepted);
      await page.keyboard.press("Escape");
      assert.deepEqual((await inspect(page)).document, accepted);
      await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
      await page.keyboard.press("Enter");
      await undoTo(page, original);
      await chooseTool(page, "redo", "redo");
      assert.deepEqual((await inspect(page)).document, accepted);
      await undoTo(page, original);
      await click(page, points[i].x, points[i].y);
    }
    // Grab away from the midpoint too: the curved stroke itself is interactive.
    const from = await filletGuidePoint(page, i === 1 ? 0.3 : 0.5);
    const corner = points[i];
    const neighbours = [points[(i + 1) % 4], points[(i + 3) % 4]];
    const target = { ...corner };
    for (const p of neighbours) {
      const length = Math.hypot(p.x - corner.x, p.y - corner.y);
      target.x += ((p.x - corner.x) / length) * 4 * (1 - 1 / Math.sqrt(2));
      target.y += ((p.y - corner.y) / length) * 4 * (1 - 1 / Math.sqrt(2));
    }
    const to = await at(page, target.x, target.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
    const result = (await inspect(page)).document.sketches[0];
    assert.equal(result.curves.length, 5, await page.getByRole("status").textContent());
    close(Number(await page.getByRole("textbox", { name: "Radius", exact: true }).inputValue()), 4);
    await undoTo(page, original);
  }
  console.log(
    `${name}: fillet click accepts, click-away/Escape retain arc, Undo/Redo and all rotated corner drags passed`,
  );
}

async function undoTo(page, target) {
  for (let i = 0; i < 8; i++) {
    await chooseTool(page, "undo", "undo");
    if (isDeepStrictEqual((await inspect(page)).document, target)) return;
  }
  assert.deepEqual((await inspect(page)).document, target);
}
