import assert from "node:assert/strict";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { runtimeNames } from "./ui-runtime.mjs";

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  cacheDir: ".cache/body-xray-render-vite",
  server: { port: 0, watch: null, hmr: false },
  optimizeDeps: { include: ["three"] },
});
await server.listen();
try {
  const names = runtimeNames(["chromium", "webkit"]);
  for (const [name, engine] of Object.entries({ chromium, webkit }).filter(([name]) =>
    names.includes(name),
  )) {
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.goto(`${server.resolvedUrls.local[0]}tests/preview-empty.html`);
      const result = await page.evaluate(async () => {
        const { bodyXrayRenderChecks } = await import("/tests/body-xray-render.ts");
        const { bodyXrayLayerChecks } = await import("/tests/body-xray-layer-render.ts");
        const { framePacerRenderChecks } = await import("/tests/frame-pacer-render.ts");
        return {
          mask: bodyXrayRenderChecks(),
          layers: bodyXrayLayerChecks(),
          pacing: await framePacerRenderChecks(),
        };
      });
      assert.deepEqual(errors, []);
      console.log(`${name}: compositor GPU pixel checks passed`, JSON.stringify(result));
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
