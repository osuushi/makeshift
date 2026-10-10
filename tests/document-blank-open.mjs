import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

export async function blankDocumentOpen(app, source, root, originalPath, drawing) {
  const initialCount = app.windows().length;
  const copy = join(root, "Blank-open.makeshift");
  const other = join(root, "Dirty-open.makeshift");
  const broken = join(root, "Blank-broken.makeshift");
  const bytes = await readFile(originalPath);
  await writeFile(copy, bytes);
  await writeFile(other, bytes);
  await writeFile(broken, "invalid archive");
  const newWindow = async (page) => {
    const opened = app.waitForEvent("window");
    await chooseTool(page, "new document", "new");
    const next = await opened;
    await settled(next);
    return next;
  };
  const open = async (page, path) => {
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    }, path);
    await chooseTool(page, "open document", "open");
  };
  const blank = await newWindow(source);
  await open(blank, broken);
  await blank
    .getByRole("status")
    .filter({ hasText: /JSON|archive/ })
    .waitFor();
  assert.equal(app.windows().length, initialCount + 1);
  assert.equal((await blank.evaluate(() => window.makeshiftDocument.status())).path, null);
  const loaded = blank.waitForEvent("domcontentloaded");
  await open(blank, copy);
  await loaded;
  await blank.waitForFunction(
    async (path) => (await window.makeshiftDocument.status()).path === path,
    copy,
  );
  await settled(blank);
  assert.equal(app.windows().length, initialCount + 1, "Open reuses the blank native window");
  assert.ok(app.windows().includes(blank), "The original Page survives Open");
  const restored = (await inspect(blank)).document;
  const normalized = (data) => JSON.parse(JSON.stringify({ ...data, bodies: data.bodies ?? [] }));
  assert.deepEqual(normalized(restored), normalized(drawing));
  assert.equal((await blank.evaluate(() => window.makeshiftDocument.status())).edited, false);
  const history = await blank.evaluate(() => window.makeshiftHistory());
  assert.equal(
    history.filter((entry) => !["navigation", "selection"].includes(entry.operation.kind)).length,
    0,
  );

  const dirty = await newWindow(blank);
  await chooseTool(dirty, "Sketch on XY", "sketch-xy");
  await dirty.keyboard.press("l");
  await drag(dirty, [0, 0], [15, 10]);
  await dirty.keyboard.press("Escape");
  const unsaved = (await inspect(dirty)).document;
  const opened = app.waitForEvent("window");
  await open(dirty, other);
  const separate = await opened;
  await settled(separate);
  assert.deepEqual((await inspect(dirty)).document, unsaved, "Open preserves edited untitled work");
  for (const page of [blank, dirty, separate]) {
    const closed = page.waitForEvent("close");
    await chooseTool(page, "close document", "close").catch((error) => {
      if (!page.isClosed()) throw error;
    });
    await closed;
  }
  assert.equal(app.windows().length, initialCount);
  console.log(
    "PASS blank Open reuses the same window, failed Open retains it, edited untitled Open stays separate",
  );
}
