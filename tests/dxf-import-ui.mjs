import assert from "node:assert/strict";
import { at, inspect, overlayPoint } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// File chooser -> worker -> document acceptance and menu keyboard dispatch are UI boundaries.
// Kept as a focused manual route, not an additional CI suite.
const fixture = [
  0,
  "SECTION",
  2,
  "ENTITIES",
  0,
  "LWPOLYLINE",
  90,
  4,
  70,
  1,
  10,
  -20,
  20,
  -10,
  10,
  20,
  20,
  -10,
  10,
  20,
  20,
  10,
  10,
  -20,
  20,
  10,
  0,
  "ENDSEC",
  0,
  "EOF",
].join("\n");
await withUiRuntimes(async (page) => {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Import", exact: true });
  assert.equal(await menu.getByRole("menuitem").count(), 3);
  assert.equal(
    await menu.getByRole("menuitem", { name: "Import STEP", exact: true }).isDisabled(),
    true,
  );
  const chooser = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: "Import DXF sketch", exact: true }).click();
  await (await chooser).setFiles({
    name: "plate.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(fixture),
  });
  await page.waitForFunction(
    () =>
      window.makeshiftInspect().document.sketches[0]?.curves.length === 4 &&
      !window.makeshiftInspect().interaction,
  );
  assert.equal((await inspect(page)).selectionTargets.length, 4);
  await page.keyboard.press("m");
  await page.waitForFunction(() => window.makeshiftInspect().moveMode);
  const tip = await overlayPoint(page, '[data-move-marker="y"] > svg');
  const origin = await at(page, 0, 0),
    destination = await at(page, 0, 4);
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  await page.mouse.move(tip.x + destination.x - origin.x, tip.y + destination.y - origin.y, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(
    () => !window.makeshiftInspect().busy && !window.makeshiftInspect().interaction,
  );
  const moved = (await inspect(page)).document.sketches[0].curves;
  assert.ok(Math.abs(moved[0].a.y + 6) < 1e-7);
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches.length, 0);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
  // Reselection through a real curve click remains available after import.
  await page.keyboard.press("Escape");
  const middle = await at(page, 0, -10);
  await page.mouse.click(middle.x, middle.y);
  assert.ok((await inspect(page)).selectionTargets.length > 0);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const exports = page.getByRole("menu", { name: "Export", exact: true });
  assert.equal(await exports.getByRole("menuitem").count(), 3);
  for (const item of await exports.getByRole("menuitem").all())
    assert.equal(await item.isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await exports.isVisible(), false);
  await page.screenshot({ path: ".cache/sketch-review/dxf-import.png" });
  await modelingImport(page);
  console.log("DXF import, editable Move, reselection, Undo/Redo and top menus passed");
});

async function modelingImport(page) {
  const menu = page.getByRole("menu", { name: "Import", exact: true });
  await chooseTool(page, "Return to Modeling", "modeling");
  await page.getByRole("button", { name: "Import", exact: true }).focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Home");
  assert.equal(
    await menu.getByRole("menuitem", { name: "Import STEP", exact: true }).isDisabled(),
    false,
  );
  const modelingChooser = page.waitForEvent("filechooser");
  await menu.getByRole("menuitem", { name: "Import DXF sketch", exact: true }).click();
  await (await modelingChooser).setFiles({
    name: "plate.dxf",
    mimeType: "application/dxf",
    buffer: Buffer.from(fixture),
  });
  await page.waitForFunction(
    () =>
      window.makeshiftInspect().document.sketches.length === 2 &&
      !window.makeshiftInspect().interaction,
  );
  assert.deepEqual((await inspect(page)).document.sketches[1].plane, {
    origin: [0, 0, 0],
    u: [1, 0, 0],
    v: [0, 1, 0],
  });
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.screenshot({ path: ".cache/sketch-review/dxf-import-menu-compact.png" });
  await page.keyboard.press("Escape");
}
