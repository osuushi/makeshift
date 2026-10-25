import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron, saveDocument } from "./native-documents.mjs";
import { drag, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const root = await mkdtemp(join(tmpdir(), "makeshift-archive-size-"));
const original = join(root, "Original.makeshift"),
  copy = join(root, "Copy.makeshift");
let app;
try {
  app = await launchElectron({ args: ["."], env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" } });
  const page = await app.firstWindow();
  page.setDefaultTimeout(12000);
  await settled(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [2, 2], [12, 8]);
  await page.keyboard.press("Escape");
  await saveDocument(page, original);
  console.log("electron: saved ordinary pointer-created sketch");
  // Padding exercises the actual byte boundary without manufacturing millions of curves.
  await page.evaluate(async () => {
    const sketch = window.makeshiftInspect().document.sketches[0];
    const reply = await window.makeshiftModel({
      kind: "edit",
      sketch: { ...sketch, padding: "x".repeat(64 * 1024 * 1024) },
    });
    if (reply.error) throw new Error(reply.error);
  });
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, copy);
  const result = await page.evaluate(async () => {
    const errors = [];
    for (const command of ["save", "save-as"])
      errors.push((await window.makeshiftDocument.command(command)).error);
    return { errors, status: await window.makeshiftDocument.status() };
  });
  assert.ok(
    result.errors.every((error) => !error),
    JSON.stringify(result.errors),
  );
  assert.equal(result.status.path, copy, "successful Save As adopts the new path");
  assert.equal(result.status.edited, false, "successful Save clears the unsaved baseline");
  const saved = await readFile(original);
  assert.ok(saved.length > 64 * 1024 * 1024);
  assert.deepEqual(await readFile(copy), saved);
  console.log("electron: Save and Save As accept model content above the former 64 MiB limit");
} finally {
  await app?.close();
  await rm(root, { recursive: true, force: true });
}
