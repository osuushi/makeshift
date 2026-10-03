import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import {
  coarseWhileSettledRoute,
  colorOnlyRoute,
  contrastRoute,
  delayedMoveRoute,
  delayedSettingsRoute,
} from "./ui-decorator-display.mjs";
import { installPreviewControl, previewStats } from "./ui-decorator-worker-control.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const native = process.env.MAKESHIFT_TEST_BROWSER === "electron";
const server = native ? null : await createServer({ server: { port: 0, watch: null, hmr: false } });
await server?.listen();
try {
  for (const [name, engine] of Object.entries(native ? { electron: null } : { chromium, webkit })) {
    const app = native
      ? await launchElectron({ args: ["."], env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" } })
      : null;
    const browser = engine ? await engine.launch({ headless: true }) : null;
    try {
      const page = app
        ? await app.firstWindow()
        : await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
      page.setDefaultTimeout(30000);
      await installPreviewControl(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      if (server) await page.goto(server.resolvedUrls.local[0]);
      if (app)
        assert.equal(
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
          false,
        );
      await contrastRoute(page, name, "threads");
      console.log(`${name}: recessed/protruding thread views and contrast passed`);
      await contrastRoute(page, name, "gear");
      console.log(`${name}: gear views and contrast passed`);
      await delayedMoveRoute(page, name);
      console.log(`${name}: delayed move/cancel/completion/Undo passed`);
      await delayedSettingsRoute(page, name);
      console.log(`${name}: delayed numeric settings/cancel/Undo passed`);
      await coarseWhileSettledRoute(page, name);
      console.log(`${name}: useful coarse remains while settled pending, full quality restored`);
      const stats = await previewStats(page);
      await colorOnlyRoute(page, name, app);
      assert.deepEqual(errors, []);
      console.log(
        `${name}: contrast/views, delayed move/settings/cancel/Undo, color-only worker retirement/persistence and byte-identical STL passed`,
        JSON.stringify(stats),
      );
    } catch (error) {
      const page = app ? await app.firstWindow() : browser.contexts()[0]?.pages()[0];
      await page?.screenshot({
        path: `.cache/sketch-review/${name}-decorator-display-failure.png`,
      });
      throw error;
    } finally {
      await browser?.close();
      await app?.close();
    }
  }
} finally {
  await server?.close();
}
