import assert from "node:assert/strict";
import { resolve } from "node:path";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(async (page) => {
  const { before, after, labels } = await page.evaluate(
    async (url) => {
      const { gridOcclusionPixels } = await import(url);
      return gridOcclusionPixels();
    },
    `/@fs${resolve("tests/grid-occlusion-scene.mjs")}`,
  );
  assert.ok(after.behindFill[0] > before.behindFill[0] + 25, "Rear geometry must fade");
  assert.ok(after.behindLine[1] > before.behindLine[1] + 25, "Rear geometry must fade");
  assert.ok(after.behindAxis[0] > before.behindAxis[0] + 25, "Rear geometry must fade");
  assert.deepEqual(after.frontAxis, before.frontAxis);
  assert.deepEqual(after.frontFill, before.frontFill);
  assert.deepEqual(after.frontLine, before.frontLine);
  assert.equal(labels[0], 1, "Viewport center stays clear even behind the grid");
  assert.equal(labels[1], 1);
  const coplanar = await page.evaluate(
    async (url) => {
      const { gridOcclusionPixels } = await import(url);
      const { before, after } = gridOcclusionPixels(true);
      let checked = 0,
        changed = 0;
      for (let i = 0; i < before.pixels.length; i += 4) {
        const [r, g, b] = before.pixels.slice(i, i + 3);
        if (r !== g || b < r + 50) continue;
        checked++;
        if (after.pixels[i] !== r || after.pixels[i + 1] !== g || after.pixels[i + 2] !== b)
          changed++;
      }
      return { checked, changed };
    },
    `/@fs${resolve("tests/grid-occlusion-scene.mjs")}`,
  );
  assert.ok(coplanar.checked > 30, JSON.stringify(coplanar));
  assert.equal(
    coplanar.changed,
    0,
    "Coplanar sketch fill stays unchanged at oblique angles and deep camera bounds",
  );
  const gradient = await page.evaluate(
    async (url) => {
      const { gridGradientPixels } = await import(url);
      return [
        [0, 0, 1],
        [0, 0.8, 1],
      ].map(gridGradientPixels);
    },
    `/@fs${resolve("tests/grid-occlusion-scene.mjs")}`,
  );
  assert.deepEqual(gradient[0], gradient[1], "Fill gradient stays in screen space while orbiting");
  assert.equal(gradient[0].center, 128, "Center remains transparent");
  assert.equal(gradient[0].clearBoundary, 128, "The middle eighth stays fully transparent");
  assert.equal(
    gradient[0].horizontal,
    gradient[0].vertical,
    "Gradient remains circular on a wide screen",
  );
  assert.ok(
    gradient[0].edge > gradient[0].horizontal && gradient[0].horizontal > gradient[0].center,
  );
  console.log(
    "Grid veil GPU pixels: coplanar fill stable; rear geometry fades; front geometry and labels preserved",
  );
});
