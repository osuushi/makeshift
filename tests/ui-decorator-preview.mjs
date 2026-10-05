import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";

export async function recessedPreviewRoute(page, name, worldPoint = [0, -8, 5]) {
  const before = (await inspect(page)).document;
  await clearSelection(page);
  await page.waitForFunction(() => {
    const view = window.makeshiftInspect();
    return (
      view.decoratorPreviewBounds.length > 0 &&
      !document.querySelector(".decorator-preview-status")?.matches(":not([hidden])")
    );
  });
  await page.mouse.move(100, 80);
  const point = await project(page, worldPoint);
  let count = 0;
  const deadline = Date.now() + 15000;
  do {
    const png = await page.screenshot({
      clip: {
        x: Math.round(point.x) - 24,
        y: Math.round(point.y) - 24,
        width: 48,
        height: 48,
      },
    });
    count = await page.evaluate(async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 48;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 48, 48).data;
      let decorated = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (Math.max(...pixels.slice(i, i + 3)) - Math.min(...pixels.slice(i, i + 3)) > 40)
          decorated++;
      return decorated;
    }, png.toString("base64"));
  } while (count < 1200 && Date.now() < deadline);
  assert.ok(
    count >= 1200,
    `Recessed preview must fill the interior face sample (${count}/2304 colored pixels)`,
  );
  await page.screenshot({ path: `.cache/sketch-review/${name}-recessed-thread-preview.png` });
  await worldClick(page, worldPoint);
  const selected = await inspect(page);
  assert.equal(selected.modelingSelection[0]?.kind, "face", "Preview keeps original face picking");
  assert.deepEqual(selected.document, before, "Rendering and picking preserve the document");
}
