import assert from "node:assert/strict";
import { project } from "./ui-blend-edit.mjs";
import { inspect, modalCompleted, reset, settled } from "./ui-helpers.mjs";
import { orientWithTurntable } from "./ui-orbit-orient.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

const capCoverage = async ({ bytes, samples }) => {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  try {
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const scale = img.width / window.innerWidth;
    return (
      samples.filter((p) => {
        const [r, g] = ctx.getImageData(
          Math.round(p.x * scale),
          Math.round(p.y * scale),
          1,
          1,
        ).data;
        return r > g + 5;
      }).length / samples.length
    );
  } finally {
    URL.revokeObjectURL(url);
  }
};

await withUiRuntimes(
  async (page, name) => {
    await reset(page);
    await page.getByRole("button", { name: "Top view", exact: true }).locator("polygon").dblclick();
    await settled(page);
    await chooseTool(page, "cube", "cube");
    const a = await project(page, [-10, -10, 0]);
    const b = await project(page, [10, 10, 0]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(
      () => !window.makeshiftInspect().busy && !!window.makeshiftInspect().preview?.bodies?.length,
    );
    await page.getByLabel("Modeling viewport").focus();
    await page.keyboard.press("Enter");
    await modalCompleted(page);
    const before = await inspect(page);
    for (const [angle, normal] of [
      ["oblique", [1, -1, 1]],
      ["steep", [0.2, -0.2, 1]],
      ["shallow", [1, -1, 0.35]],
    ]) {
      await orientWithTurntable(page, normal);
      await chooseTool(page, "drill", "drill");
      const center = await project(page, [2, 2, 20]);
      const edge = await project(page, [6, 2, 20]);
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(edge.x, edge.y, { steps: 8 });
      await page.locator(".circular-primitive-dimension:visible").waitFor();
      const samples = [];
      for (const radius of [0.6, 1.4, 2.4]) {
        for (let i = 0; i < 24; i++) {
          const theta = (i * Math.PI) / 12;
          samples.push(
            await project(page, [2 + radius * Math.cos(theta), 2 + radius * Math.sin(theta), 20]),
          );
        }
      }
      const label = await page.locator(".circular-primitive-dimension:visible").boundingBox();
      const capSamples = samples.filter(
        (p) =>
          p.x < label.x - 2 ||
          p.x > label.x + label.width + 2 ||
          p.y < label.y - 2 ||
          p.y > label.y + label.height + 2,
      );
      const screenshot = await page.screenshot({
        path: `.cache/sketch-review/${name}-drill-overlay-${angle}.png`,
      });
      const fraction = await page.evaluate(capCoverage, {
        bytes: [...screenshot],
        samples: capSamples,
      });
      assert.ok(fraction > 0.95, `${angle}: pink entry cap coverage ${fraction}`);
      assert.deepEqual((await inspect(page)).document, before.document);
      await page.keyboard.press("Escape");
      await page.mouse.up();
    }
    console.log(`${name}: transparent drill overlay cap is continuous at three camera angles`);
  },
  { allowed: ["chromium", "webkit", "electron"], timeout: 30000 },
);
