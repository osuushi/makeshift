import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { inspect, settled } from "./ui-helpers.mjs";

const root = await mkdtemp(join(tmpdir(), "makeshift-camera-"));
const path = join(root, "Camera.makeshift");
let app;
try {
  async function launch() {
    const instance = await _electron.launch({
      args: [".", `--user-data-dir=${join(root, "profile")}`],
      env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
    });
    const page = await instance.firstWindow();
    page.setDefaultTimeout(15000);
    await settled(page);
    await instance.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, path);
    return { instance, page };
  }
  let session = await launch();
  app = session.instance;
  let { page } = session;
  const initial = (await inspect(page)).camera;
  const canvas = page.locator('canvas[aria-label="Modeling viewport"]');
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(120, -80);
  await page.keyboard.down("Meta");
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 90, bounds.y + bounds.height / 2 + 40, {
    steps: 8,
  });
  await page.mouse.up();
  await page.keyboard.up("Meta");
  await settled(page);
  const moved = (await inspect(page)).camera;
  assert.notDeepEqual(moved.target, initial.target);
  assert.notDeepEqual(moved.position, initial.position);
  await page.keyboard.press("Meta+s");
  await page.waitForFunction(async () => (await window.makeshiftDocument.status()).path !== null);
  const archived = JSON.parse(await readFile(path, "utf8"));
  assert.deepEqual(archived.camera, {
    position: moved.position,
    target: moved.target,
    up: moved.up,
    height: moved.height,
  });
  const opened = app.waitForEvent("window");
  const savedPage = page;
  await page.keyboard.press("Meta+n");
  page = await opened;
  await settled(page);
  await page.waitForFunction(async () => (await window.makeshiftDocument.status()).path === null);
  assert.deepEqual((await inspect(page)).camera.target, initial.target);
  await page.keyboard.press("Meta+o");
  page = savedPage;
  await page.waitForFunction(async () => (await window.makeshiftDocument.status()).path !== null);
  const reopened = (await inspect(page)).camera;
  assert.deepEqual(reopened.target, moved.target);
  assert.deepEqual(reopened.position, moved.position);
  assert.deepEqual(reopened.up, moved.up);
  await app.close();
  session = await launch();
  app = session.instance;
  const relaunched = (await inspect(session.page)).camera;
  assert.deepEqual(relaunched.target, moved.target);
  assert.deepEqual(relaunched.position, moved.position);
  console.log("Camera Save, New, Open and relaunch passed.");
} finally {
  await app?.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
