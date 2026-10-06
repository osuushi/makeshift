import assert from "node:assert/strict";
import { orient, project } from "./ui-blend-edit.mjs";
import { decoratorCylinder } from "./ui-decorator-cylinder.mjs";
import { previewReady } from "./ui-decorator-worker-control.mjs";
import { worldClick } from "./ui-face-offset.mjs";
import { inspect, modalCompleted } from "./ui-helpers.mjs";
import { clearSelection } from "./ui-reconnection-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

async function tealPixels(page, worldPoint, size = 6) {
  const point = await project(page, worldPoint);
  const png = await page.screenshot({
    clip: {
      x: Math.round(point.x) - size / 2,
      y: Math.round(point.y) - size / 2,
      width: size,
      height: size,
    },
  });
  return page.evaluate(
    async ({ base64, size }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, size, size).data;
      let teal = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i + 1] - pixels[i] > 25 && pixels[i + 2] - pixels[i] > 20) teal++;
      return teal;
    },
    { base64: png.toString("base64"), size },
  );
}

await withUiRuntimes(
  async (page, name) => {
    for (const kind of ["external", "internal"]) {
      await decoratorCylinder(page);
      if (kind === "internal") {
        await clearSelection(page);
        await orient(page, [0, -0.5, 1]);
        await worldClick(page, [0, 0, 10]);
        await chooseTool(page, "shell", "shell");
        await page.getByRole("textbox", { name: "Shell thickness", exact: true }).fill("-2");
        await inspect(page);
        await page.getByRole("button", { name: "Accept shell", exact: true }).click();
        await modalCompleted(page);
        await clearSelection(page);
        await worldClick(page, [0, 6, 6]);
      }
      const before = (await inspect(page)).document;
      const selected = (await inspect(page)).modelingSelection[0];
      const face = before.bodies[0].faces.find((face) => face.id === selected.face);
      assert.ok(face?.cylinder, "Threads applied through analytic cylinder picking");
      assert.equal(face.cylinder.outward, kind === "external" ? 1 : -1);
      await chooseTool(page, "threads", "threads");
      await previewReady(page);
      const accepted = (await inspect(page)).document;
      assert.deepEqual(accepted.bodies, before.bodies);
      assert.equal(accepted.decorators[0].settings.start, 0);
      assert.equal(accepted.decorators[0].settings.end, 0);
      await clearSelection(page);
      await orient(page, [0, -0.5, 1]);
      await page.mouse.move(100, 70);
      await page.screenshot({ path: `.cache/sketch-review/${name}-${kind}-thread-rim.png` });
      assert.equal(
        await tealPixels(page, [7.1, 0, 10]),
        0,
        `${name}: ${kind} preview must leave top rim clear`,
      );
      assert.ok(
        (await tealPixels(page, kind === "external" ? [0, -8, 5] : [0, 6, 6], 24)) > 100,
        `${name}: ${kind} thread profile remains visibly colored`,
      );
      await worldClick(page, [7.1, 0, 10]);
      const picked = (await inspect(page)).modelingSelection[0];
      assert.ok(accepted.bodies[0].faces.find((face) => face.id === picked.face)?.plane);
      assert.deepEqual((await inspect(page)).document, accepted);
      console.log(
        `${name}: ${kind} threaded rim clear; full extent and top-face picking preserved`,
      );
    }
  },
  { allowed: ["chromium", "webkit"], timeout: 30000 },
);
