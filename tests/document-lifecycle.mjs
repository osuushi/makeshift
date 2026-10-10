import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { blankDocumentOpen } from "./document-blank-open.mjs";
import { hostModelBoundary } from "./host-model-boundary.mjs";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// IPC routing, global menus and application shutdown cannot be proved by model
// tests. Keep two raw document Pages and use real pointer/keyboard geometry.
const root = await mkdtemp(join(tmpdir(), "makeshift-documents-"));
const profile = join(root, "profile");
const firstPath = join(root, "First.makeshift"),
  secondPath = join(root, "Second.makeshift");
let app;
const status = (page) => page.evaluate(() => window.makeshiftDocument.status());
const agent = (page, request) =>
  page.evaluate((request) => window.makeshiftAgent.request(request), request);
async function until(check) {
  for (let i = 0; i < 300; i++) {
    try {
      if (await check()) return;
    } catch {
      /* Wait for observable publication. */
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error(`Document lifecycle did not settle: ${check}`);
}
async function close() {
  const current = app;
  const timer = setTimeout(() => current.process().kill("SIGKILL"), 15000);
  try {
    await current.close();
  } finally {
    clearTimeout(timer);
  }
}
async function launch() {
  app = await _electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
  });
  await app.evaluate(({ dialog, BrowserWindow }) => {
    // Hidden windows cannot acquire OS focus; exercise routing via their native focus events.
    BrowserWindow.getFocusedWindow = () => null;
    globalThis.answers = [];
    globalThis.promptNames = [];
    globalThis.savePath = undefined;
    globalThis.openPaths = [];
    dialog.showMessageBox = async (_window, options) => {
      const value = options ?? _window;
      globalThis.promptNames.push(value.message);
      return { response: globalThis.answers.shift() ?? 2 };
    };
    dialog.showSaveDialog = async () => ({
      canceled: !globalThis.savePath,
      filePath: globalThis.savePath,
    });
    dialog.showOpenDialog = async () => ({
      canceled: !globalThis.openPaths.length,
      filePaths: globalThis.openPaths.splice(0),
    });
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await settled(page);
  return page;
}
async function menu(label, group = "File", page) {
  if (page) {
    const name = (await status(page)).name;
    await app.evaluate(({ BrowserWindow }, name) => {
      const window = BrowserWindow.getAllWindows().find((window) =>
        window.getTitle().startsWith(name),
      );
      window?.emit("focus");
    }, name);
  }
  await app.evaluate(
    ({ Menu }, { label, group }) => {
      Menu.getApplicationMenu()
        .items.find((item) => item.label === group)
        .submenu.items.find((item) => item.label === label)
        .click();
    },
    { label, group },
  );
}
async function draw(page, x = 0) {
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [x, 0], [x + 20, 10]);
  await page.keyboard.press("Escape");
  await settled(page);
}
async function save(page, path) {
  await app.evaluate((_, path) => {
    globalThis.savePath = path;
  }, path);
  await chooseTool(page, "save document as", "save-as");
  await until(async () => (await status(page)).path === path && !(await status(page)).edited);
}
async function newWindow(page) {
  const opened = app.waitForEvent("window");
  await chooseTool(page, "new document", "new");
  const next = await opened;
  await settled(next);
  return next;
}
async function openFile(path) {
  await app.evaluate(({ app }, path) => app.emit("open-file", { preventDefault() {} }, path), path);
  await until(async () => {
    for (const page of app.windows()) if ((await status(page)).path === path) return true;
    return false;
  });
  for (const page of app.windows()) if ((await status(page)).path === path) return page;
  throw new Error("Missing opened file");
}
try {
  const first = await launch();
  await draw(first);
  const firstDocument = (await inspect(first)).document;
  await hostModelBoundary(first);
  const second = await newWindow(first);
  assert.equal(app.windows().length, 2);
  assert.deepEqual(
    (await inspect(first)).document,
    firstDocument,
    "New retains the previous drawing",
  );
  assert.equal((await status(first)).edited, true);
  assert.equal((await inspect(second)).document.sketches.length, 0);
  await draw(second, 35);
  const secondDocument = (await inspect(second)).document;
  assert.notDeepEqual(firstDocument, secondDocument);
  await save(first, firstPath);
  await save(second, secondPath);
  for (let i = 0; i < 4 && !(await status(second)).edited; i++) {
    await menu("Undo", "Edit", second);
    await settled(second);
  }
  await until(async () => (await status(second)).edited);
  assert.deepEqual(
    (await inspect(first)).document,
    firstDocument,
    "Focused Undo never edits another window",
  );
  assert.equal((await status(first)).edited, false);
  await menu("Redo", "Edit", second);
  await until(async () => !(await status(second)).edited);
  assert.deepEqual((await inspect(second)).document, secondDocument);
  await app.evaluate((_, path) => {
    globalThis.savePath = path;
  }, firstPath);
  await chooseTool(second, "save document as", "save-as");
  await second.getByRole("status").filter({ hasText: "already open" }).waitFor();
  assert.equal((await status(second)).path, secondPath);
  assert.deepEqual(
    JSON.parse(await readFile(firstPath, "utf8")).document.sketches,
    firstDocument.sketches,
  );
  const alias = join(root, "Alias.makeshift");
  await symlink(firstPath, alias);
  await app.evaluate(({ app }, path) => {
    app.emit("open-file", { preventDefault() {} }, path);
    app.emit("open-file", { preventDefault() {} }, path);
  }, alias);
  await until(() =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length === 2),
  );
  for (let i = 0; i < 4 && !(await status(first)).edited; i++) {
    await menu("Undo", "Edit");
    await settled(first);
  }
  await until(async () => (await status(first)).edited);
  assert.equal(
    (await status(second)).edited,
    false,
    "Duplicate Finder Open focuses the original document",
  );
  await menu("Redo", "Edit", first);
  await until(async () => !(await status(first)).edited);

  await agent(first, {
    kind: "configure",
    preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
  });
  const firstAgent = await agent(first, { kind: "start", cols: 80, rows: 24 });
  const secondAgent = await agent(second, { kind: "start", cols: 80, rows: 24 });
  assert.equal(firstAgent.running, true);
  assert.equal(secondAgent.running, true);
  assert.notEqual(firstAgent.workspace, secondAgent.workspace);
  await agent(first, { kind: "write", data: "printf first > identity.txt\n" });
  await agent(second, { kind: "write", data: "printf second > identity.txt\n" });
  await until(
    async () => (await readFile(join(firstAgent.workspace, "identity.txt"), "utf8")) === "first",
  );
  await until(
    async () => (await readFile(join(secondAgent.workspace, "identity.txt"), "utf8")) === "second",
  );
  await until(async () => (await status(first)).edited && (await status(second)).edited);
  await app.evaluate(() => {
    globalThis.answers = [1];
  });
  await chooseTool(first, "close document", "close");
  await until(async () => !(await agent(first, { kind: "read" })).running);
  assert.equal(first.isClosed(), false, "Cancel Close retains the document");
  assert.equal(
    (await agent(second, { kind: "read" })).running,
    true,
    "Closing one agent leaves the other running",
  );
  await app.evaluate(({ app }) => {
    globalThis.answers = [2, 1];
    globalThis.promptNames = [];
    app.quit();
  });
  await until(() => app.evaluate(() => globalThis.promptNames.length === 2));
  await until(
    async () => !(await first.evaluate(() => window.makeshiftModel({ kind: "read" }))).error,
  );
  assert.equal(app.windows().length, 2, "Cancel on the second Quit prompt preserves both windows");
  assert.deepEqual((await inspect(first)).document, firstDocument);
  assert.deepEqual((await inspect(second)).document, secondDocument);
  await save(first, firstPath);
  await save(second, secondPath);
  const savedBounds = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows();
    windows[0].setBounds({ x: 40, y: 60, width: 940, height: 620 });
    windows[1].setBounds({ x: 80, y: 100, width: 1000, height: 680 });
    return windows.map((window) => ({
      name: window.getTitle().split(" — ")[0],
      bounds: window.getBounds(),
    }));
  });
  await close();

  await launch();
  await until(() => app.windows().length === 2);
  assert.deepEqual(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        name: window.getTitle().split(" — ")[0],
        bounds: window.getBounds(),
      })),
    ),
    savedBounds,
    "Relaunch restores each window's own placement and size",
  );
  const restored = app.windows();
  for (const page of restored) await settled(page);
  assert.deepEqual(
    (await Promise.all(restored.map(status))).map((s) => s.path).sort(),
    [firstPath, secondPath].sort(),
  );
  for (const page of restored) {
    assert.equal((await status(page)).edited, false);
    assert.equal((await agent(page, { kind: "read" })).running, false);
    const history = await page.evaluate(() => window.makeshiftModel({ kind: "read-history" }));
    assert.equal(
      history.history.filter(
        (entry) => entry.operation.kind !== "navigation" && entry.operation.kind !== "selection",
      ).length,
      0,
    );
  }
  const reopenedFirst = await openFile(firstPath);
  assert.equal(app.windows().length, 2);
  assert.equal(
    await readFile(
      join((await agent(reopenedFirst, { kind: "read" })).workspace, "identity.txt"),
      "utf8",
    ),
    "first",
  );
  const broken = join(root, "Broken.makeshift");
  await blankDocumentOpen(app, reopenedFirst, root, firstPath, firstDocument);
  await writeFile(broken, "invalid archive");
  const promptCount = await app.evaluate(() => globalThis.promptNames.length);
  await app.evaluate(
    ({ app }, path) => app.emit("open-file", { preventDefault() {} }, path),
    broken,
  );
  await until(() => app.evaluate((_, count) => globalThis.promptNames.length > count, promptCount));
  assert.equal(app.windows().length, 2, "Failed Open removes only its provisional window");
  await close();
  console.log(
    "PASS independent document windows: pointer geometry, menu Undo/Redo, save collision, Finder duplicate focus, agents, Close/Quit cancellation and restoration",
  );
} finally {
  await app?.evaluate(({ app }) => app.exit()).catch(() => {});
  await app?.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
}
