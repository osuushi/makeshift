import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchElectron } from "./native-documents.mjs";
import { smokeRoute } from "./ui-smoke-route.mjs";

// The same compact smoke protects built Linux and Mac host/preload integration.
await mkdir(".cache/sketch-review", { recursive: true });
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 850 });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  assert.equal(await page.evaluate(() => typeof window.require), "undefined");
  await smokeRoute(page);
  assert.deepEqual(errors, []);
  console.log("Hidden Electron smoke: sandbox, native geometry, Save/Open and history passed");
} finally {
  await app.close();
}
