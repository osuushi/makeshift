import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { orient, project } from "./ui-blend-edit.mjs";
import { makePlate, worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { sectionExtrusion } from "./ui-section-extrusion.mjs";
import { chooseTool } from "./ui-tools.mjs";

// The shared GPU stencil pass must fill solid material without filling actual holes.
// Native geometry and ordinary section controls exercise its integration with scene bits.
await withUiRuntimes(async (page, name) => {
  const original = await makePlate(page);
  await page.getByRole("button", { name: "Hide Sketch 1", exact: true }).click();
  await orient(page, [1, -1, 1]);
  await worldClick(page, [6, 6, 5]);
  const before = await sample(page, [6, 6, 5]);
  await chooseTool(page, "cross section", "cross-section");
  await page.getByRole("button", { name: "Move plane Z", exact: true }).click();
  await page.getByRole("textbox", { name: "Plane translation Z", exact: true }).fill("-2.5");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await orient(page, [0, 0, 1]);
  const cut = await inspect(page);
  assert.equal(cut.crossSection.origin[2], 2.5);
  await page.mouse.move(1100, 80);
  const filled = await sample(page, [6, 6, 2.5]);
  const hole = await sample(page, [0.6, 0.6, 2.5]);
  await mkdir(".cache/section-fill", { recursive: true });
  await page.screenshot({ path: `.cache/section-fill/${name}-top.png` });
  assert.ok(
    filled.some((n, i) => Math.abs(n - before[i]) > 20),
    "Cut face has its body pattern",
  );
  assert.ok(
    hole.filter((_, i) => i % 4 !== 3).every((n) => n > 230),
    "Real through-hole stays open",
  );
  await mkdir(".cache/section-fill", { recursive: true });
  await orient(page, [1, -1, 1]);
  await page.screenshot({ path: `.cache/section-fill/${name}-hollow.png` });
  assert.deepEqual((await inspect(page)).document, original, "Section fill never edits solids");
  await sectionExtrusion(page, sample);
  console.log(
    `${name}: patterned section material, open through-hole and captured extrusion drag passed`,
  );
});

async function sample(page, point) {
  const p = await project(page, point);
  const png = await page.screenshot({
    clip: { x: Math.round(p.x) - 3, y: Math.round(p.y) - 3, width: 6, height: 6 },
  });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 6;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    return [...context.getImageData(0, 0, 6, 6).data];
  }, png.toString("base64"));
}
