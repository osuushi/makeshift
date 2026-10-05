import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { electronTestArguments } from "./native-documents.mjs";
import { settled } from "./ui-helpers.mjs";
import { changeScale, geometryScaleRoute, preferencesRoute } from "./ui-interface-scale.mjs";
import { installTestFrames } from "./ui-test-frames.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const directory = await mkdtemp(join(tmpdir(), "makeshift-interface-scale-"));
let app;
async function launch() {
  app = await _electron.launch({
    args: electronTestArguments([".", `--user-data-dir=${directory}`]),
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
  });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({ response: 2 });
  });
  const page = await app.firstWindow();
  await installTestFrames(page);
  return page;
}
async function close() {
  if (!app) return;
  const current = app;
  app = undefined;
  const timeout = setTimeout(() => current.process().kill("SIGKILL"), 10000);
  try {
    await current.close();
  } finally {
    clearTimeout(timeout);
  }
}
try {
  const page = await launch();
  page.setDefaultTimeout(30000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await settled(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const zoomRoles = await app.evaluate(({ BrowserWindow, Menu }) => {
    assertHidden(BrowserWindow.getAllWindows()[0]);
    function assertHidden(window) {
      if (window.isVisible()) throw new Error("Acceptance window must remain hidden");
    }
    const roles = [];
    function visit(menu) {
      for (const item of menu.items) {
        roles.push(item.role);
        if (item.submenu) visit(item.submenu);
      }
    }
    visit(Menu.getApplicationMenu());
    return roles.filter((role) =>
      ["zoomIn", "zoomOut", "resetZoom", "zoomin", "zoomout", "resetzoom"].includes(role),
    );
  });
  assert.deepEqual(zoomRoles, []);
  await preferencesRoute(page);
  for (const scale of [0.8, 1.5]) {
    await geometryScaleRoute(page, scale, "electron");
    const zoom = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
    );
    assert.equal(zoom, 1);
  }
  await nativeRotateCoordinates(app, page);
  await agentScaleRoute(page);
  assert.deepEqual(errors, []);
  await changeScale(page, 1.5);
  await close();
  const reopened = await launch();
  await settled(reopened);
  await reopened.locator(".settings-trigger").click();
  const restored = reopened.getByRole("dialog", { name: "Settings", exact: true });
  assert.equal(await restored.getByRole("combobox").inputValue(), "1.5");
  await restored.getByRole("button", { name: "Reset to 100%" }).click();
  await restored.getByRole("button", { name: "Done", exact: true }).click();
  console.log(
    "Hidden Electron: menu/key zoom locked, real sketch/solid routes at 80/150%, host rotate coordinate transport, agent settings/dock/terminal and scale reset passed",
  );
} catch (error) {
  const page = await app?.firstWindow();
  if (page) {
    await page.screenshot({ path: ".cache/sketch-review/electron-interface-scale-failure.png" });
    console.log(
      await page.evaluate(() => ({
        formHidden: document.querySelector(".agent-settings")?.hidden,
        message: document.querySelector(".agent-message")?.textContent,
        header: document.querySelector(".agent-header")?.textContent,
      })),
    );
  }
  throw error;
} finally {
  await close();
  await rm(directory, { recursive: true, force: true });
}

async function nativeRotateCoordinates(app, page) {
  await page.evaluate(() => {
    window.scaleRotate = null;
    window.disposeScaleRotate = window.makeshiftNavigation.onRotate((degrees, pointer) => {
      window.scaleRotate = { degrees, pointer };
    });
  });
  for (const scale of [0.8, 1.5]) {
    await changeScale(page, scale);
    await app.evaluate(({ BrowserWindow, screen }) => {
      const window = BrowserWindow.getAllWindows()[0];
      const content = window.getContentBounds();
      const original = screen.getCursorScreenPoint;
      screen.getCursorScreenPoint = () => ({ x: content.x + 400, y: content.y + 300 });
      try {
        window.emit("rotate-gesture", {}, 0);
      } finally {
        screen.getCursorScreenPoint = original;
      }
    });
    await page.waitForFunction(() => !!window.scaleRotate);
    const packet = await page.evaluate(() => window.scaleRotate);
    assert.equal(Math.abs(packet.degrees), 0);
    assert.deepEqual(packet.pointer, { x: 400, y: 300 });
    await page.evaluate(() => {
      window.scaleRotate = null;
    });
  }
  await page.evaluate(() => window.disposeScaleRotate());
}

async function agentScaleRoute(page) {
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  const original = await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }));
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.waitForFunction(
    async () => (await window.makeshiftAgent.request({ kind: "settings" })).running,
  );
  const terminal = page.locator(".agent-screen canvas");
  await terminal.waitFor();
  for (const scale of [0.8, 1.5]) {
    await changeScale(page, scale);
    await page.locator(".agent-screen textarea").focus();
    await page.keyboard.type("printf 'scale-test\\n'");
    await page.keyboard.press("Enter");
    await page.locator(".agent-header [data-settings]").click();
    await page.locator(".agent-settings").waitFor({ state: "visible" });
    assert.equal(await page.getByLabel("Executable", { exact: true }).inputValue(), "/bin/sh");
    await page.getByRole("button", { name: "Save settings", exact: true }).click();
    await page.locator(".agent-settings").waitFor({ state: "hidden" });
    console.log(`Electron: agent settings saved at ${scale}`);
    assert.deepEqual(
      (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).preferences,
      original.preferences,
    );
    const box = await terminal.boundingBox();
    const screen = await page.locator(".agent-screen").boundingBox();
    assert.ok(box.width <= screen.width + 1 && box.height <= screen.height + 1);
    await page.getByRole("button", { name: "Change agent dock position" }).click();
    await settled(page);
    await page.getByRole("button", { name: "Change agent dock position" }).click();
    await settled(page);
  }
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.waitForFunction(
    async () => !(await window.makeshiftAgent.request({ kind: "settings" })).running,
  );
  await page.locator(".settings-trigger").click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await dialog.getByRole("button", { name: "Reset to 100%" }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
