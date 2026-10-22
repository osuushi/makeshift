import assert from "node:assert/strict";
import { click, drag, inspect, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function constraintPanelRoute(page, name) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("c");
  await drag(page, [8, 0], [12, 0]);
  await drag(page, [-10, 0], [-8, 0]);
  await page.keyboard.press("v");
  await click(page, -12, 0);
  await page.keyboard.down("Shift");
  await click(page, 8, 4);
  await page.keyboard.up("Shift");
  const panel = page.getByRole("group", { name: "Selected entity constraints" });
  const available = panel.locator(".available-constraints");
  const existing = panel.locator(".existing-constraints");
  assert.equal(await panel.getByRole("heading", { name: "Existing constraints" }).count(), 1);
  assert.equal(await panel.getByRole("heading", { name: "Available constraints" }).count(), 1);
  const add = available.getByRole("button", { name: "Constrain concentric", exact: true });
  await add.waitFor();
  assert.equal(
    await available.getByRole("button", { name: "Constrain tangent" }).isVisible(),
    true,
  );
  const before = (await inspect(page)).document;
  const a = await panel.boundingBox();
  await page.mouse.move(1000, 600);
  await page.mouse.wheel(60, 30);
  await inspect(page);
  const b = await panel.boundingBox();
  const readouts = await page.locator(".selection-readouts").boundingBox();
  const viewport = await page.locator("canvas").boundingBox();
  assert.equal(b.x, a.x, "Panel stays anchored while geometry pans");
  assert.ok(b.y >= readouts.y && b.y + b.height <= readouts.y + readouts.height);
  assert.ok(
    b.x + b.width > viewport.x + viewport.width - 50 &&
      readouts.y + readouts.height > viewport.height - 100,
    "Constraints live in the lower-right readouts area",
  );
  await add.click();
  await inspect(page);
  const remove = existing.getByRole("button", {
    name: "Remove Concentric constraint",
    exact: true,
  });
  await remove.waitFor();
  assert.equal(await add.isVisible(), false, "Existing relation is not offered for addition");
  assert.equal(await page.locator(".constraint-icons").count(), 0);
  await remove.hover();
  await page.screenshot({ path: `.cache/sketch-review/${name}-constraint-panel.png` });
  await remove.click();
  await inspect(page);
  await add.waitFor();
  await chooseTool(page, "undo", "undo");
  await inspect(page);
  await chooseTool(page, "undo", "undo");
  assert.deepEqual((await inspect(page)).document, before, "Panel actions preserve snapshot Undo");
  console.log(
    `${name}: stable lower-right constraint sections, add/remove transfer and Undo passed`,
  );
}
