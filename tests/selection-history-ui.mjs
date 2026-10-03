import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { bodySelectionEntryRoute } from "./ui-body-selection-entry.mjs";
import { modelFrustumSelectionRoute } from "./ui-model-frustum-selection.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { selectionGeometryRedoRoute } from "./ui-selection-geometry-redo.mjs";
import { selectionHistoryRoute } from "./ui-selection-history.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const [name] = runtimeNames(["chromium", "webkit", "electron"], ["chromium"]);
let server, browser, app, page;
try {
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    page = await app.firstWindow();
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    server = await createServer({ server: { port: 0 } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await selectionGeometryRedoRoute(page, name);
  await selectionHistoryRoute(page, name);
  await bodySelectionEntryRoute(page, name);
  await modelFrustumSelectionRoute(page, name);
} catch (error) {
  await page?.screenshot({ path: `.cache/sketch-review/${name}-selection-history-failure.png` });
  console.log(
    await page?.evaluate(() => ({
      selection: window.makeshiftInspect().modelingSelection,
      notice: document.querySelector("[role=status]")?.textContent,
    })),
  );
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
