import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import { createServer } from "vite";
import { launchElectron } from "./native-documents.mjs";
import { inspect } from "./ui-helpers.mjs";
import { modelingRoute } from "./ui-modeling.mjs";
import { runtimeNames } from "./ui-runtime.mjs";
import { sketchPlaneRoute } from "./ui-sketch-plane.mjs";
import {
  menuDiscoveryRoute,
  menuSketchToolsRoute,
  menuTouchRoute,
} from "./ui-tool-menu-discovery.mjs";
import { menuGeometryRoute } from "./ui-tool-menu-geometry.mjs";

async function run(page, name) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await inspect(page);
  assert.equal(await page.locator(".toolbox").count(), 0);
  await page.getByRole("button", { name: "More tools", exact: true }).click();
  await page.getByRole("option", { name: "Solid", exact: true }).click();
  assert.equal(
    await page.getByRole("option", { name: "Shell", exact: true }).getAttribute("aria-disabled"),
    "true",
  );
  const search = page.getByRole("combobox", { name: "Find a tool" });
  await search.fill("thickness");
  assert.equal(
    await page.locator('[role="option"][aria-selected="true"]').getAttribute("data-command"),
    "shell",
  );
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("dialog", { name: "Find a tool" }).isVisible(), true);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Meta+f");
  await search.fill("recatngle");
  assert.equal(
    await page.locator('[role="option"][aria-selected="true"]').getAttribute("data-command"),
    "rectangle",
  );
  await page.keyboard.press("Enter");
  assert.equal((await inspect(page)).tool, "rectangle");
  await page.screenshot({ path: `.cache/sketch-review/${name}-tool-menu-closed.png` });
  await page.keyboard.press("Meta+f");
  await search.fill("fillet");
  await page.screenshot({ path: `.cache/sketch-review/${name}-tool-menu.png` });
  await page.keyboard.press("Escape");
  await menuGeometryRoute(page, name);
  await menuDiscoveryRoute(page, name);
  await menuSketchToolsRoute(page, name);
  await modelingRoute(page, name);
  await sketchPlaneRoute(page, name);
  if (name !== "electron") await menuTouchRoute(page, name);
  assert.deepEqual(errors, []);
  console.log(`${name}: tool menu smoke passed`);
}
await mkdir(".cache/sketch-review", { recursive: true });
const names = runtimeNames(process.env.MAKESHIFT_MENU_SMOKE ? ["chromium"] : undefined);
const server = await createServer({ server: { port: 0 } });
await server.listen();
try {
  const engines = process.env.MAKESHIFT_MENU_SMOKE ? { chromium } : { chromium, webkit };
  for (const [name, engine] of Object.entries(engines).filter(([name]) => names.includes(name))) {
    if (process.env.MAKESHIFT_TEST_BROWSER && process.env.MAKESHIFT_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 850 },
        hasTouch: true,
      });
      await page.goto(server.resolvedUrls.local[0]);
      await run(page, name);
    } finally {
      await browser.close();
    }
  }
  if (
    !process.env.MAKESHIFT_MENU_SMOKE &&
    (!process.env.MAKESHIFT_TEST_BROWSER || process.env.MAKESHIFT_TEST_BROWSER === "electron")
  ) {
    const app = await launchElectron({
      args: ["."],
      env: {
        ...process.env,
        MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
        MAKESHIFT_TEST_HIDDEN: "1",
      },
    });
    try {
      await run(await app.firstWindow(), "electron");
    } finally {
      await app.close();
    }
  }
} finally {
  await server.close();
}
