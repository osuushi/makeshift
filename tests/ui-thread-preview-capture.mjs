import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { openDocument } from "./native-documents.mjs";
import { project } from "./ui-blend-edit.mjs";
import { displaySettings } from "./ui-decorator-display.mjs";
import { previewReady } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, reset } from "./ui-helpers.mjs";

const fixture = JSON.parse(await readFile("tests/fixtures/thread-preview-rim.json", "utf8"));

export async function capturedThreadRim(page, name) {
  await reset(page);
  await openDocument(page, {
    name: "thread-preview-rim.makeshift",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ format: "makeshift", version: 1, ...fixture })),
  });
  await page.waitForFunction(() => window.makeshiftInspect().document.decorators?.length === 2);
  await previewReady(page);
  const before = (await inspect(page)).document;
  const basis = await Promise.all(
    [
      [0, 0, 26],
      [1, 0, 26],
      [0, 1, 26],
    ].map((p) => project(page, p)),
  );
  await displaySettings(page, (dialog) =>
    dialog.getByRole("combobox", { name: "Decorator preview detail" }).selectOption("color-only"),
  );
  await page.mouse.move(100, 70);
  const baseline = await page.screenshot();
  await displaySettings(page, (dialog) =>
    dialog.getByRole("combobox", { name: "Decorator preview detail" }).selectOption("detailed"),
  );
  await previewReady(page);
  await page.mouse.move(100, 70);
  const detailed = await page.screenshot({
    path: `.cache/sketch-review/${name}-captured-thread-rim.png`,
  });
  const result = await compareAnnulus(page, baseline, detailed, basis);
  assert.ok(
    result.changed > 1000,
    "Detailed threads remain visibly distinct from support coloring",
  );
  assert.equal(result.rimChanged, 0, `Captured annulus must stay clear: ${JSON.stringify(result)}`);
  await worldClick(page, [11, 0, 26]);
  const picked = (await inspect(page)).modelingSelection[0];
  assert.ok(before.bodies[0].faces.find((face) => face.id === picked.face)?.plane);
  assert.deepEqual((await inspect(page)).document, before);
  console.log(`${name}: captured dual threads leave the full top annulus unchanged`, result);
}

async function compareAnnulus(page, baseline, detailed, basis) {
  return page.evaluate(
    async ({ before, after, basis }) => {
      const pixels = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        return {
          data: context.getImageData(0, 0, image.width, image.height).data,
          width: image.width,
        };
      };
      const [a, b] = await Promise.all([pixels(before), pixels(after)]);
      const ratio = a.width / window.innerWidth;
      const [o, u, v] = basis.map(({ x, y }) => ({ x: x * ratio, y: y * ratio }));
      const ux = u.x - o.x,
        uy = u.y - o.y,
        vx = v.x - o.x,
        vy = v.y - o.y;
      const determinant = ux * vy - uy * vx;
      let changed = 0,
        rimChanged = 0,
        samples = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const dx = ((i / 4) % a.width) + 0.5 - o.x;
        const dy = Math.floor(i / 4 / a.width) + 0.5 - o.y;
        const radius = Math.hypot(
          (dx * vy - dy * vx) / determinant,
          (dy * ux - dx * uy) / determinant,
        );
        const rim = radius > 8.1 && radius < 13.9;
        if (rim) samples++;
        if ([0, 1, 2].some((channel) => Math.abs(a.data[i + channel] - b.data[i + channel]) > 3)) {
          changed++;
          if (rim) rimChanged++;
        }
      }
      return { changed, rimChanged, samples };
    },
    { before: baseline.toString("base64"), after: detailed.toString("base64"), basis },
  );
}
