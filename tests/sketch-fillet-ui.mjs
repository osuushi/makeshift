import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { tangentBowRoute } from "./ui-bow-tangent.mjs";
import { cornerFilletRoute } from "./ui-corner-fillet.mjs";
import { cubicCornerFilletRoute } from "./ui-cubic-corner-fillet.mjs";
import { curvedRoundingRoute } from "./ui-curved-rounding.mjs";
import { filletLossRoute, filletRoute } from "./ui-fillet.mjs";
import { filletConsumptionRoute } from "./ui-fillet-consumption.mjs";
import { filletCursorRoute } from "./ui-fillet-cursor.mjs";
import { filletGuideRoute } from "./ui-fillet-guide.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { secondCornerFilletRoute } from "./ui-second-corner-fillet.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const [name] = runtimeNames(["chromium", "webkit", "electron"], ["chromium"]);
let server, browser, app, page;
try {
  server = await createServer({ server: { port: 0, watch: null } });
  await server.listen();
  if (name === "electron") {
    app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        MAKESHIFT_TEST_HIDDEN: "1",
        MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
      },
    });
    page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setContentSize(1280, 850),
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      false,
    );
  } else {
    browser = await { chromium, webkit }[name].launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    await page.goto(server.resolvedUrls.local[0]);
  }
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of [
    cubicCornerFilletRoute,
    secondCornerFilletRoute,
    filletGuideRoute,
    filletCursorRoute,
    filletRoute,
    filletLossRoute,
    cornerFilletRoute,
    curvedRoundingRoute,
    filletConsumptionRoute,
    tangentBowRoute,
  ]) {
    if (
      process.env.MAKESHIFT_TEST_ROUTE &&
      !process.env.MAKESHIFT_TEST_ROUTE.split(",").includes(route.name)
    )
      continue;
    console.log(`${name}: starting ${route.name}`);
    await route(page, name);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  await page?.screenshot({ path: `.cache/sketch-review/${name}-sketch-fillet-failure.png` });
  throw error;
} finally {
  await browser?.close();
  await app?.close();
  await server?.close();
}
