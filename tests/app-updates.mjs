import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";
import { updateProgressRoute } from "./ui-update-progress.mjs";

const root = await mkdtemp(join(tmpdir(), "makeshift-updates-"));
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  await settled(page);
  await app.evaluate(({ autoUpdater, dialog }) => {
    globalThis.updatePrompts = [];
    globalThis.updateResponse = 1;
    globalThis.saveResponse = 1;
    globalThis.installs = 0;
    autoUpdater.quitAndInstall = () => {
      globalThis.installs++;
    };
    dialog.showMessageBox = async (...args) => {
      const options = args.at(-1);
      globalThis.updatePrompts.push(options.message);
      return {
        response:
          options.buttons?.[0] === "Save" ? globalThis.saveResponse : globalThis.updateResponse,
      };
    };
  });
  await checkMenu();
  assert.match((await prompts()).at(-1), /signed macOS release/);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await page.keyboard.press("Escape");
  await settled(page);
  const before = await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document));

  // The OS download/install transport is stubbed; document handling is the real app.
  await app.evaluate(({ autoUpdater }) => {
    autoUpdater.emit("update-downloaded", {}, "", "Makeshift test update");
  });
  assert.match((await prompts()).at(-1), /update is ready/);
  assert.equal(await app.evaluate(() => globalThis.installs), 0);

  await app.evaluate(() => {
    globalThis.updateResponse = 0;
  });
  await checkMenu();
  await page.waitForFunction(() => !window.makeshiftInspect().busy);
  await waitForPrompts(4);
  assert.equal(await app.evaluate(() => globalThis.installs), 0);
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document)),
    before,
  );

  // Canceling the save-file picker must also leave the updater pending.
  await app.evaluate(({ dialog }) => {
    globalThis.saveResponse = 0;
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
  });
  await checkMenu();
  await waitForPrompts(6);
  await page.waitForFunction(() => !window.makeshiftInspect().busy);
  assert.equal(await app.evaluate(() => globalThis.installs), 0);

  const file = join(root, "before-update.makeshift");
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, file);
  await checkMenu();
  for (let i = 0; i < 100; i++) {
    if (await app.evaluate(() => globalThis.installs === 1)) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.equal(await app.evaluate(() => globalThis.installs), 1);
  assert((await readFile(file)).length > 100);
  assert.equal((await page.evaluate(() => window.makeshiftDocument.status())).edited, false);
  // A native installation error must restore the ordinary close/save guard.
  await app.evaluate(({ autoUpdater }) => {
    autoUpdater.emit("error", new Error("Simulated installer failure"));
    globalThis.saveResponse = 1;
  });
  await page.keyboard.press("r");
  await drag(page, [15, 10], [25, 20]);
  await page.keyboard.press("Escape");
  await settled(page);
  assert.equal((await page.evaluate(() => window.makeshiftDocument.status())).edited, true);
  const count = (await prompts()).length;
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await waitForPrompts(count + 1);
  assert.equal(page.isClosed(), false);
  assert.equal(await app.evaluate(() => globalThis.installs), 1);
  // Exercise actual status windows with deterministic updater events.
  const opened = app.waitForEvent("window", { timeout: 10000 });
  void opened.catch(() => {});
  await app.evaluate(
    ({ autoUpdater }, file) => {
      for (const event of [
        "error",
        "update-available",
        "update-not-available",
        "update-downloaded",
      ])
        autoUpdater.removeAllListeners(event);
      const require = process.getBuiltinModule("module").createRequire(file);
      const { AppUpdates } = require(file);
      globalThis.feedbackUpdates = new AppUpdates(
        () => {},
        () => {},
      );
      globalThis.feedbackUpdates.enabled = true;
      globalThis.checks = 0;
      autoUpdater.checkForUpdates = () => {
        globalThis.checks++;
      };
      globalThis.feedbackUpdates.check();
    },
    join(process.cwd(), ".build/host/host/app-updates.js"),
  );
  const status = await opened;
  assert(status);
  await status.waitForLoadState();
  await status
    .locator("h1")
    .filter({ hasText: "Checking for updates…" })
    .waitFor({ timeout: 10000 });
  await updateProgressRoute(status);
  await app.evaluate(({ autoUpdater }) => autoUpdater.emit("update-available"));
  await status.locator("h1").filter({ hasText: "Downloading update…" }).waitFor({ timeout: 10000 });
  await app.evaluate(() => globalThis.feedbackUpdates.check());
  assert.equal(await app.evaluate(() => globalThis.checks), 1);
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.getTitle() === "Software Update — Makeshift")
      .close();
  });
  const reopened = app.waitForEvent("window", { timeout: 10000 });
  await app.evaluate(() => globalThis.feedbackUpdates.check());
  const downloading = await reopened;
  await downloading
    .locator("h1")
    .filter({ hasText: "Downloading update…" })
    .waitFor({ timeout: 10000 });
  const noUpdateClosed = downloading.waitForEvent("close", { timeout: 10000 });
  await app.evaluate(({ autoUpdater }) => autoUpdater.emit("update-not-available"));
  await noUpdateClosed;
  assert.equal(downloading.isClosed(), true);
  assert.equal((await prompts()).at(-1), "Makeshift is up to date.");
  const retry = app.waitForEvent("window", { timeout: 10000 });
  await app.evaluate(() => globalThis.feedbackUpdates.check());
  const checking = await retry;
  await checking
    .locator("h1")
    .filter({ hasText: "Checking for updates…" })
    .waitFor({ timeout: 10000 });
  const failedClosed = checking.waitForEvent("close", { timeout: 10000 });
  await app.evaluate(({ autoUpdater }) => autoUpdater.emit("error", new Error("Offline")));
  await failedClosed;
  assert.equal(checking.isClosed(), true);
  assert.equal((await prompts()).at(-1), "Could not check for updates.");
  await app.evaluate(({ autoUpdater }) => {
    globalThis.feedbackUpdates.check(false);
    autoUpdater.emit("update-available");
  });
  assert.equal(app.windows().length, 1);
  const background = app.waitForEvent("window", { timeout: 10000 });
  await app.evaluate(() => globalThis.feedbackUpdates.check());
  const adopted = await background;
  await adopted
    .locator("h1")
    .filter({ hasText: "Downloading update…" })
    .waitFor({ timeout: 10000 });
  const readyClosed = adopted.waitForEvent("close", { timeout: 10000 });
  await app.evaluate(({ autoUpdater }) => {
    globalThis.updateResponse = 1;
    autoUpdater.emit("update-downloaded", {}, "", "Test release");
  });
  await readyClosed;
  assert.equal(adopted.isClosed(), true);
  assert.equal((await prompts()).at(-1), "A Makeshift update is ready.");
  console.log(
    "PASS hidden Electron: checking/downloading feedback, reopen, background adoption, completion/error cleanup, update menu, Later, unsaved-work Cancel, canceled Save As, save before install, installer failure restores close guard; OS transport stubbed",
  );
} finally {
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
  await app.close();
  await rm(root, { recursive: true, force: true });
}

async function checkMenu() {
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "Makeshift")
      .submenu.items.find((item) => item.label === "Check for Updates…")
      .click();
  });
}
async function prompts() {
  return app.evaluate(() => globalThis.updatePrompts);
}
async function waitForPrompts(count) {
  for (let i = 0; i < 100 && (await prompts()).length < count; i++)
    await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal((await prompts()).length, count);
}
