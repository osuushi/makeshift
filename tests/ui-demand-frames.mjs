import assert from "node:assert/strict";
import { drag, inspect, reset } from "./ui-helpers.mjs";
import { withUiRuntimes } from "./ui-runtime.mjs";
import { chooseTool } from "./ui-tools.mjs";

assert.equal(process.env.MAKESHIFT_TEST_FRAME_MODE, "on-demand");
await withUiRuntimes(
  async (page, name) => {
    const countDraws = () => {
      window.testGpuDraws = 0;
      for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
        for (const method of ["drawArrays", "drawElements"]) {
          const original = type.prototype[method];
          type.prototype[method] = function (...args) {
            window.testGpuDraws++;
            return original.apply(this, args);
          };
        }
      }
    };
    await page.addInitScript(countDraws);
    await reset(page);
    await chooseTool(page, "Sketch on XY", "sketch-xy");
    await chooseTool(page, "rectangle", "rectangle");
    assert.equal(await page.evaluate(() => window.testGpuDraws), 0);
    const blank = await page.screenshot();
    assert.ok(await page.evaluate(() => window.testGpuDraws > 0));
    await page.evaluate(() => {
      window.testGpuDraws = 0;
    });
    await drag(page, [-15, -10], [15, 10]);
    assert.equal((await inspect(page)).document.sketches[0].curves.length, 4);
    assert.equal(await page.evaluate(() => window.testGpuDraws), 0, "Input avoids GPU draws");
    const drawn = await page.screenshot();
    assert.ok(await page.evaluate(() => window.testGpuDraws > 0), "Capture renders the scene");
    assert.equal(drawn.equals(blank), false, "Capture shows changed geometry");
    await page.reload();
    await inspect(page);
    assert.equal(await page.evaluate(() => window.makeshiftTestFrameMode), "on-demand");
    assert.equal(await page.evaluate(() => window.testGpuDraws), 0, "Reload preserves deferral");
    await page.screenshot();
    assert.ok(await page.evaluate(() => window.testGpuDraws > 0));
    console.log(`${name}: real rectangle input avoids GPU draws; fresh captures and reload pass`);
  },
  { allowed: ["chromium", "electron"] },
);
