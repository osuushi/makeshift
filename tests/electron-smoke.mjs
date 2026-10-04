import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchElectron } from "./native-documents.mjs";
import { backendPersistence } from "./ui-backend.mjs";
import { extrudeRoute } from "./ui-extrude.mjs";

// The complete shared-editor suite runs on Linux. Keep the Mac gate focused on
// the built host/preload boundary, real native geometry and document persistence.
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
  await extrudeRoute(page, "electron-smoke");
  await backendPersistence(page, "electron-smoke");
  assert.deepEqual(errors, []);
  console.log("Hidden Electron smoke: sandbox, native geometry, Save/Open and history passed");
} finally {
  await app.close();
}
