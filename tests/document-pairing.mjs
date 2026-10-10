import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { launchElectron } from "./native-documents.mjs";
import { drag, inspect, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Two simultaneous pairings and their dialogs cannot be tested by model fixtures.
const root = await mkdtemp(join(tmpdir(), "makeshift-document-pairing-"));
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1", MAKESHIFT_DEV_URL: "" },
});
const browser = await chromium.launch({ headless: true });
async function pair(desktop) {
  await desktop.getByRole("button", { name: "Trackpad", exact: true }).click();
  await desktop.getByRole("button", { name: "Tablet", exact: true }).click();
  const link = desktop.locator(".ipad-addresses a").first();
  await link.waitFor();
  const page = await browser.newPage();
  await page.goto(await link.getAttribute("href"));
  await settled(page);
  await desktop
    .getByText("iPad connected · This document is controlled from the browser")
    .waitFor();
  return page;
}
async function savePaired(page, name) {
  await chooseTool(page, "save document as", "save-as");
  await page.getByLabel("Computer folder path").fill(root);
  await page.getByLabel("Computer folder path").press("Enter");
  await page.getByLabel("File name").fill(name);
  await page.locator("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForFunction(
    async (path) => (await window.makeshiftDocument.status()).path === path,
    join(root, name),
  );
  assert.ok((await readFile(join(root, name))).length > 100);
}
try {
  const first = await app.firstWindow();
  await settled(first);
  const opened = app.waitForEvent("window");
  await chooseTool(first, "new document", "new");
  const second = await opened;
  await settled(second);
  const pairedFirst = await pair(first);
  await chooseTool(pairedFirst, "Sketch on XY", "sketch-xy");
  await pairedFirst.keyboard.press("l");
  await drag(pairedFirst, [-10, 0], [10, 10]);
  await pairedFirst.keyboard.press("Escape");
  await settled(pairedFirst);
  const drawing = (await inspect(pairedFirst)).document;
  assert.equal(drawing.sketches[0].curves.length, 1);
  assert.equal((await inspect(second)).document.sketches.length, 0);

  // Hosting one document must not redirect another window's native save panel.
  const nativePath = join(root, "native.makeshift");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
  }, nativePath);
  await chooseTool(second, "save document as", "save-as");
  await second.waitForFunction(
    async (path) => (await window.makeshiftDocument.status()).path === path,
    nativePath,
  );
  await savePaired(pairedFirst, "paired-first.makeshift");
  const pairedSecond = await pair(second);
  assert.notEqual(new URL(pairedFirst.url()).port, new URL(pairedSecond.url()).port);
  assert.equal((await inspect(pairedSecond)).document.sketches.length, 0);
  await savePaired(pairedSecond, "paired-second.makeshift");
  assert.deepEqual((await inspect(pairedFirst)).document, drawing);

  await first.getByRole("button", { name: "Return to computer", exact: true }).click();
  await pairedFirst.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
  await settled(first);
  assert.deepEqual((await inspect(first)).document, drawing);
  assert.equal((await inspect(pairedSecond)).document.sketches.length, 0);
  await savePaired(pairedSecond, "still-paired.makeshift");
  await second.getByRole("button", { name: "Return to computer", exact: true }).click();
  await pairedSecond.getByRole("button", { name: "Reconnect", exact: true }).waitFor();
  console.log(
    "PASS document pairing: separate listeners, model ownership, native/remote Save dialogs and independent return to computer",
  );
} finally {
  await browser.close();
  await app.close();
  await rm(root, { recursive: true, force: true });
}
