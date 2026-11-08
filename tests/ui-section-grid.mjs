import assert from "node:assert/strict";
import { closeSettings, settingsSurface } from "./settings-surface.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";

// GPU caps are a separate pass: material renderOrder alone cannot keep the grid visible.
export async function sectionGrid(page) {
  const original = (await inspect(page)).document;
  const p = await project(page, [15.3, 0, 27.2]);
  const clip = { x: Math.round(p.x) - 20, y: Math.round(p.y) - 20, width: 40, height: 40 };
  await gridOpacity(page, "Home");
  const without = await pixels(page, clip);
  await gridOpacity(page, "End");
  const withGrid = await pixels(page, clip);
  let changed = 0;
  let unchanged = 0;
  for (let i = 0; i < without.length; i += 4) {
    const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(without[i + c] - withGrid[i + c])));
    if (delta > 15) changed++;
    if (delta <= 1) unchanged++;
  }
  assert.ok(changed > 60, `Sketch grid lines overlay the patterned cap: ${changed} pixels`);
  assert.ok(unchanged > 300, `Section pattern remains visible between grid lines: ${unchanged}`);
  await page.getByRole("button", { name: "Application settings" }).click();
  const settings = await settingsSurface(page, "View");
  await settings.getByRole("button", { name: "Reset grid display", exact: true }).click();
  await closeSettings(settings);
  assert.deepEqual(
    (await inspect(page)).document,
    original,
    "Grid presentation never edits geometry",
  );
  await page.screenshot({ path: ".cache/sketch-review/section-sketch-grid.png" });
}

async function gridOpacity(page, key) {
  await page.getByRole("button", { name: "Application settings" }).click();
  const settings = await settingsSurface(page, "View");
  await settings.getByRole("slider", { name: "Grid opacity", exact: true }).press(key);
  await settings.getByRole("slider", { name: "Grid fill opacity", exact: true }).press("Home");
  await closeSettings(settings);
  await page.mouse.move(1100, 80);
}

async function pixels(page, clip) {
  const png = await page.screenshot({ clip });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, image.width, image.height).data];
  }, png.toString("base64"));
}
