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
  assert.ok(after.behindFill[0] > before.behindFill[0] + 80, JSON.stringify({ before, after }));
  assert.ok(after.behindLine[1] > before.behindLine[1] + 80, JSON.stringify({ before, after }));
  assert.ok(after.behindAxis[0] > before.behindAxis[0] + 80, JSON.stringify({ before, after }));
  assert.deepEqual(after.frontAxis, before.frontAxis);
  assert.deepEqual(after.frontFill, before.frontFill);
  assert.deepEqual(after.frontLine, before.frontLine);
  assert.equal(labels[0], 0);
  assert.equal(labels[1], 1);
  console.log(
    "Grid veil GPU pixels: rear translucent fill/fat line fade; front geometry and labels preserved",
  );
});
