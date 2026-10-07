import assert from "node:assert/strict";
import { customDecoratorRoute } from "./ui-decorator-custom.mjs";
import { decoratorPresetRoute } from "./ui-decorator-presets.mjs";
import { previewReady } from "./ui-decorator-worker-control.mjs";
import { inspect } from "./ui-helpers.mjs";
import { completed, cylinder, threads } from "./ui-preview-fallback-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";

await withUiRuntimes(
  async (page, name) => {
    await cylinder(page);
    await threads(page);
    const originalBodies = (await inspect(page)).document.bodies;
    await decoratorPresetRoute(page, name);
    const thread = (await completed(page)).document;
    assert.deepEqual(thread.bodies, originalBodies);
    await previewReady(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.makeshiftInspect));
    assert.deepEqual((await completed(page)).document, thread);
    await previewReady(page);
    console.log(`${name}: ordinary thread presets/Cancel/history and selected reload passed`);
    await customDecoratorRoute(page);
    const custom = (await completed(page)).document;
    assert.equal(custom.decorators[0].problem, undefined);
    // Reload a completed preview, rather than aborting its module imports in WebKit.
    await previewReady(page);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.makeshiftInspect));
    assert.deepEqual((await completed(page)).document, custom);
    await previewReady(page);
    console.log(`${name}: ordinary custom drafts/Cancel/history/repair and selected reload passed`);
  },
  { timeout: 30000 },
);
