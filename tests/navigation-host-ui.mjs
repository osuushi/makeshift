import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { drag } from "./ui-helpers.mjs";
import { navigationIdle, navigationRoundTrip } from "./ui-navigation-history.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Emitted macOS host events prove BrowserWindow → IPC → preload → renderer.
// They do not establish physical trackpad hardware delivery or gesture feel.
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
try {
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25),
  );
  await navigationIdle(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-15, -10], [15, 10]);
  await page.keyboard.press("Escape");
  await navigationIdle(page);
  await page.evaluate(() => {
    window.navigationHostPackets = 0;
    window.makeshiftNavigation.onRotate(() => {
      window.navigationHostPackets++;
    });
  });
  const anchor = { x: 950, y: 600 };
  const rotate = async (degrees) => {
    const previous = await page.evaluate(() => window.navigationHostPackets);
    await app.evaluate(
      ({ BrowserWindow, screen }, { degrees, anchor }) => {
        const window = BrowserWindow.getAllWindows()[0],
          bounds = window.getContentBounds();
        const factor = window.webContents.getZoomFactor(),
          original = screen.getCursorScreenPoint;
        screen.getCursorScreenPoint = () => ({
          x: bounds.x + anchor.x * factor,
          y: bounds.y + anchor.y * factor,
        });
        try {
          window.emit("rotate-gesture", {}, degrees);
        } finally {
          screen.getCursorScreenPoint = original;
        }
      },
      { degrees, anchor },
    );
    await page.waitForFunction((count) => window.navigationHostPackets > count, previous);
  };
  await navigationRoundTrip(
    page,
    async () => {
      await rotate(-8);
      await rotate(-3);
      await rotate(-45);
      await rotate(0);
    },
    "Native twist packets coalesce",
  );
  const before = await page.evaluate(() => window.makeshiftHistory());
  await rotate(2);
  await rotate(0);
  await navigationIdle(page);
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    before,
    "Below-threshold native twist creates no view history",
  );
  console.log(
    "Hidden Electron: native cursor/zoom conversion and emitted twist history coalescing/Undo/Redo passed; physical delivery unverified",
  );
} catch (error) {
  console.error("Native twist route failed:", error);
  throw error;
} finally {
  await app.close();
}
