import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { orient, project } from "./ui-blend-edit.mjs";
import { drag, inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Founder capture: four bodies hashed to blue and their coplanar caps fought for depth.
// Screenshot samples verify actual GPU blending and sketch ink preservation.
await withUiRuntimes(async (page, name) => {
  await openDocument(page, resolve("tests/fixtures/section-overlap.makeshift"));
  await inspect(page);
  await page.getByRole("button", { name: "Application settings" }).click();
  await page.getByRole("slider", { name: "Section front opacity", exact: true }).press("Home");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await orient(page, [0, -1, 0]);
  await page.getByRole("button", { name: "Hide Body 3", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 4", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 2", exact: true }).click();
  const first = await samples(page);
  await page.getByRole("button", { name: "Show Body 2", exact: true }).click();
  await page.getByRole("button", { name: "Hide Body 1", exact: true }).click();
  const second = await samples(page);
  await page.getByRole("button", { name: "Show Body 1", exact: true }).click();
  const blended = await samples(page);
  assert.ok(
    first.some((v, i) => Math.abs(v - second[i]) > 20),
    "Bodies have distinct colors",
  );
  const delta = Math.max(...blended.map((v, i) => Math.abs(v - (first[i] + second[i]) / 2)));
  assert.ok(delta < 4, `Overlap blends both patterns uniformly: maximum RGB error ${delta}`);
  await chooseTool(page, "Sketch on XZ", "sketch-xz");
  await page.keyboard.press("l");
  await drag(page, [-5, 8], [17, 8], ["Shift"]);
  await page.keyboard.press("Escape");
  const ink = await samples(page, [15, 0, 8], 3);
  await chooseTool(page, "hide bodies", "hide-bodies");
  const unobscured = await samples(page, [15, 0, 8], 3);
  assert.deepEqual(ink, unobscured, "Caps preserve sketch ink on their plane");
  await chooseTool(page, "show bodies", "show-bodies");
  await chooseTool(page, "return to modeling", "modeling");
  await page.getByRole("button", { name: "Select Sketch 1", exact: true }).click();
  await page.getByRole("button", { name: "Show Body 3", exact: true }).click();
  await page.getByRole("button", { name: "Show Body 4", exact: true }).click();
  await orient(page, [1, -1, 1]);
  await page.screenshot({ path: `.cache/sketch-review/${name}-section-overlap.png` });
  console.log(
    `${name}: captured overlapping caps blend without depth competition; sketch ink stays visible`,
  );
});

async function samples(page, point = [15.3, 0, 27.2], size = 1) {
  await page.mouse.move(1100, 80);
  const p = await project(page, point);
  const png = await page.screenshot({
    clip: {
      x: Math.round(p.x) - Math.floor(size / 2),
      y: Math.round(p.y) - Math.floor(size / 2),
      width: size,
      height: size,
    },
  });
  return page.evaluate(async (data) => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const colors = Array.from({ length: image.width * image.height }, (_, i) => [
      ...pixels.slice(i * 4, i * 4 + 3),
    ]);
    return colors.sort((a, b) => a[0] + a[1] + a[2] - b[0] - b[1] - b[2])[0];
  }, png.toString("base64"));
}
