import assert from "node:assert/strict";
import { resolve } from "node:path";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { inspect } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

// Founder capture: distant camera makes camera-space clipping lose the plane tolerance.
// Only real GPU rendering can catch the resulting broken coplanar ink and triangle gaps.
await withUiRuntimes(async (page, name) => {
  await openDocument(page, resolve("tests/fixtures/section-distant-camera.makeshift"));
  await page.getByRole("button", { name: "Select Sketch 2", exact: true }).click();
  const before = await inspect(page);
  await page.mouse.move(1100, 80);
  await page.screenshot({ path: `.cache/sketch-review/${name}-distant-section.png` });
  const points = [];
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * 2 * Math.PI;
    points.push(
      await project(page, [
        19 + 11.40175425099138 * Math.cos(angle),
        0,
        32 + 11.40175425099138 * Math.sin(angle),
      ]),
    );
  }
  const png = await page.screenshot();
  const ink = await page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return points.map((p) => {
        const pixels = ctx.getImageData(Math.round(p.x) - 3, Math.round(p.y) - 3, 7, 7).data;
        let darkest = 255;
        for (let i = 0; i < pixels.length; i += 4) darkest = Math.min(darkest, pixels[i]);
        return darkest;
      });
    },
    { data: png.toString("base64"), points },
  );
  const interior = [];
  for (const x of [17, 21, 25])
    for (const z of [34, 37, 40]) interior.push(await project(page, [x, 0, z]));
  const fill = await page.evaluate(
    async ({ data, points }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      return points.map((p) => [...ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data]);
    },
    { data: png.toString("base64"), points: interior },
  );
  assert.ok(
    fill.every(([r, , b]) => r < 220 && b > r + 15),
    "Circle fill has no clipped triangle gaps",
  );
  console.log(name, "48 coplanar ink samples and nine interior fill samples passed");
  assert.ok(
    ink.every((v) => v < 150),
    "Every coplanar circle segment remains visible",
  );
  assert.deepEqual((await inspect(page)).document, before.document);
});
