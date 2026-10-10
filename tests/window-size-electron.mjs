import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { createServer } from "vite";

const directory = await mkdtemp(join(tmpdir(), "makeshift-window-size-"));
const preference = join(directory, "window-size.json");
let app;
const server = await createServer({ server: { host: "127.0.0.1", port: 0 } });
await server.listen();
async function launch() {
  app = await _electron.launch({
    args: [".", `--user-data-dir=${directory}`],
    env: {
      ...process.env,
      MAKESHIFT_TEST_HIDDEN: "1",
      MAKESHIFT_DEV_URL: server.resolvedUrls.local[0],
    },
  });
  const page = await app.firstWindow();
  await page.waitForFunction(() => !!window.makeshiftInspect);
  return app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window.isVisible()) throw new Error("Expected an isolated hidden window");
    const { width, height } = window.getBounds();
    return { width, height, available: screen.getPrimaryDisplay().workAreaSize };
  });
}
async function close() {
  if (!app) return;
  const current = app;
  app = undefined;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    current.process().kill("SIGKILL");
  }, 10000);
  try {
    await current.close();
    assert.equal(timedOut, false, "Electron should quit normally");
  } finally {
    clearTimeout(timeout);
  }
}
try {
  const initial = await launch();
  assert.equal(initial.width, Math.min(1280, initial.available.width));
  assert.equal(initial.height, Math.min(850, initial.available.height));
  const resized = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(940, 620);
    const { width, height } = window.getBounds();
    return { width, height };
  });
  await close();
  assert.deepEqual(JSON.parse(await readFile(preference, "utf8")), resized);
  const restored = await launch();
  assert.equal(restored.width, resized.width);
  assert.equal(restored.height, resized.height);
  await close();
  await launch();
  const filled = await app.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setBounds(screen.getPrimaryDisplay().workArea);
    window.maximize();
    const { width, height } = window.getBounds();
    return { width, height };
  });
  await close();
  assert.deepEqual(JSON.parse(await readFile(preference, "utf8")), filled);
  const filledRestored = await launch();
  assert.equal(filledRestored.width, filled.width);
  assert.equal(filledRestored.height, filled.height);
  await close();
  await launch();
  const devSize = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(980, 660);
    const { width, height } = window.getBounds();
    return { width, height };
  });
  // Exercise terminal Ctrl-C reaching Electron directly.
  await new Promise((resolve) => setTimeout(resolve, 800));
  const child = app.process();
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGINT");
  await exited;
  app = undefined;
  const devRestored = await launch();
  assert.equal(devRestored.width, devSize.width);
  assert.equal(devRestored.height, devSize.height);
  await close();
  await rm(join(directory, "document-windows.json"), { force: true });
  await writeFile(preference, '{"width":999999,"height":999999}');
  const oversized = await launch();
  assert.equal(oversized.width, oversized.available.width);
  assert.equal(oversized.height, oversized.available.height);
  await close();
  for (const invalid of ['{"width":-1,"height":620}', "broken JSON"]) {
    await rm(join(directory, "document-windows.json"), { force: true });
    await writeFile(preference, invalid);
    const fallback = await launch();
    assert.equal(fallback.width, initial.width);
    assert.equal(fallback.height, initial.height);
    await close();
  }
  console.log(
    "Hidden dev Electron: screen-filling size, quit/SIGINT relaunch and invalid preferences passed",
  );
} finally {
  await close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
