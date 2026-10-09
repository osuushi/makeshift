import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { bodyMoveRoute } from "./ui-body-move.mjs";
import { bodyRotationEntryRoute } from "./ui-body-rotation-entry.mjs";
import { moveFieldsRoute } from "./ui-move-fields.mjs";
import { moveToolRoute } from "./ui-move-tool.mjs";
import { moveWidgetRoute } from "./ui-move-widget.mjs";
import { rotationSnappingRoute } from "./ui-rotation-snapping.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { sketchPlacementWidgetRoute } from "./ui-sketch-placement-widget.mjs";
import { transformDeleteRoute, transformPrecisionRoute } from "./ui-transform-precision.mjs";

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
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 800),
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    server = await createServer({ server: { port: 0 } });
    await server.listen();
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => {
    throw error;
  });
  await transformPrecisionRoute(page, name);
  await transformDeleteRoute(page, name);
  await moveFieldsRoute(page, name);
  await rotationSnappingRoute(page, name);
  await sketchPlacementWidgetRoute(page, name);
  if (!process.env.MAKESHIFT_PLACEMENT_ONLY) {
    await moveToolRoute(page, name);
    await page.screenshot({ path: `.cache/sketch-review/${name}-move-widget-sketch.png` });
    await bodyMoveRoute(page, name);
    await moveWidgetRoute(page, name);
    await bodyRotationEntryRoute(page, name);
    await bodyRotationEntryRoute(page, name, "pointer release");
  }
} catch (error) {
  await page?.screenshot({ path: `.cache/sketch-review/${name}-move-widget-failure.png` });
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
