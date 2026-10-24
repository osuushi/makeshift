import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";

const root = await mkdtemp(join(tmpdir(), "makeshift-attach-ui-"));
const source = join(root, "photo one.png");
await writeFile(source, "file chooser bytes");
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(15000);
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: { preset: "custom", executable: "/bin/sh", args: ["-i"], env: {} },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const before = await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }));
  assert(before.workspace);
  const terminal = page.locator(".agent-screen textarea");
  await terminal.focus();
  await page.keyboard.type("cp ");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file…" }).click();
  await (await chooser).setFiles(source);
  await waitFile(join(before.workspace, "attachments", "photo one.png"));
  await page.waitForFunction(() => !document.querySelector("[data-attach]").disabled);
  await page.keyboard.type(" copied.png");
  await page.keyboard.press("Enter");
  await waitFile(join(before.workspace, "copied.png"));
  assert.equal(await readFile(join(before.workspace, "copied.png"), "utf8"), "file chooser bytes");

  await terminal.focus();
  await page.keyboard.type("cp ");
  await page.locator(".agent-dock").evaluate((panel) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["dropped bytes"], "photo one.png", { type: "image/png" }));
    panel.dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
    panel.dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
    );
  });
  await waitFile(join(before.workspace, "attachments", "photo one (2).png"));
  await page.waitForFunction(() => !document.querySelector("[data-attach]").disabled);
  await page.keyboard.type(" dropped.png");
  await page.keyboard.press("Enter");
  await waitFile(join(before.workspace, "dropped.png"));
  assert.equal(await readFile(join(before.workspace, "dropped.png"), "utf8"), "dropped bytes");
  assert.equal((await page.evaluate(() => window.makeshiftDocument.status())).edited, true);

  // Clipboard routing crosses Ghostty's text-only handlers, Electron IPC and the PTY.
  // Unit attachment tests cannot catch a swallowed or duplicated paste event.
  const clipboardImage = await pasteImages(app, page, before.workspace);

  const large = join(root, "large.bin");
  await writeFile(large, Buffer.alloc(21 * 1024 * 1024));
  const warningChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file…" }).click();
  await (await warningChooser).setFiles(large);
  const warning = page.getByRole("dialog");
  await warning.getByText(/bundled in the saved Makeshift drawing/).waitFor();
  await warning.getByRole("button", { name: "Cancel" }).click();
  await assert.rejects(access(join(before.workspace, "attachments", "large.bin")));
  const acceptedChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Attach file…" }).click();
  await (await acceptedChooser).setFiles(large);
  await warning.getByRole("button", { name: "Attach files" }).click();
  await waitFile(join(before.workspace, "attachments", "large.bin"));
  await page.waitForFunction(() => !document.querySelector("[data-attach]").disabled);
  assert.equal(
    (await readFile(join(before.workspace, "attachments", "large.bin"))).length,
    21 * 1024 * 1024,
  );

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .locator(".agent-status")
    .filter({ hasText: /Exited|Stopped/ })
    .waitFor();
  const saved = join(root, "attached.makeshift");
  await saveDocument(page, saved);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (options) => ({
      response: options.buttons?.length === 2 ? 0 : 2,
    });
  });
  await openDocument(page, saved);
  await page.waitForFunction(async (previous) => {
    const state = await window.makeshiftAgent.request({ kind: "read" });
    return state.workspace && state.workspace !== previous;
  }, before.workspace);
  const after = await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }));
  assert.deepEqual(
    await readFile(join(after.workspace, "attachments", "photo one (2).png")),
    Buffer.from("dropped bytes"),
  );
  assert.deepEqual(
    await readFile(join(after.workspace, "attachments", "clipboard-image.png")),
    clipboardImage,
  );
  assert.equal((await page.evaluate(() => window.makeshiftDocument.status())).edited, false);
  assert.equal(
    (await page.evaluate(() => window.makeshiftInspect())).document.bodies?.length ?? 0,
    0,
  );
  console.log(
    "PASS file chooser, drop, image/text paste, terminal cursor path, collision, size warning, save/reopen",
  );
} finally {
  const forceClose = setTimeout(() => app.process().kill("SIGKILL"), 3000);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (options) => ({
      response: options.buttons?.length === 2 ? 0 : 2,
    });
  });
  await app.close();
  clearTimeout(forceClose);
  await rm(root, { recursive: true, force: true });
}

async function pasteImages(app, page, workspace) {
  const base64 = await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
    const image = nativeImage.createFromBitmap(Buffer.from([20, 40, 60, 255]), {
      width: 1,
      height: 1,
    });
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([image.toPNG()], { type: "image/png" }),
        "text/plain": "IMAGE TEXT MUST NOT BE PASTED",
      }),
    ]);
    const item = (await clipboard.read()).find((item) => item.types.includes("image/png"));
    return Buffer.from(await (await item.getType("image/png")).arrayBuffer()).toString("base64");
  });
  const image = Buffer.from(base64, "base64");
  const terminal = page.locator(".agent-screen textarea");
  await terminal.focus();
  await page.keyboard.type("cp ");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+Shift+v");
  await waitFile(join(workspace, "attachments", "clipboard-image.png"));
  await page.waitForFunction(() => !document.querySelector("[data-attach]").disabled);
  await page.keyboard.type(" keyboard-image.png");
  await page.keyboard.press("Enter");
  await waitFile(join(workspace, "keyboard-image.png"));
  assert.deepEqual(await readFile(join(workspace, "keyboard-image.png")), image);

  // Browser/iPad paste can carry image and text representations together.
  await page.keyboard.type("cp ");
  await terminal.evaluate((input, base64) => {
    const bytes = Uint8Array.from(atob(base64), (value) => value.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "clipboard-image.png", { type: "image/png" }));
    transfer.setData("text/plain", "IMAGE TEXT MUST NOT BE PASTED");
    const event = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
    });
    input.dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error("Image paste was not handled");
  }, base64);
  await waitFile(join(workspace, "attachments", "clipboard-image (2).png"));
  await page.waitForFunction(() => !document.querySelector("[data-attach]").disabled);
  await page.keyboard.type(" event-image.png");
  await page.keyboard.press("Enter");
  await waitFile(join(workspace, "event-image.png"));
  assert.deepEqual(await readFile(join(workspace, "event-image.png")), image);

  await page.keyboard.type("cp ");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.paste());
  await waitFile(join(workspace, "attachments", "image.png"));
  await page.waitForFunction(() => !document.querySelector("[data-attach]").disabled);
  await page.keyboard.type(" native-image.png");
  await page.keyboard.press("Enter");
  await waitFile(join(workspace, "native-image.png"));
  assert.deepEqual(await readFile(join(workspace, "native-image.png")), image);

  await app.evaluate(({ clipboard }) =>
    clipboard.writeText("printf text-paste > text-paste.txt\n"),
  );
  await page.keyboard.press(process.platform === "darwin" ? "Meta+v" : "Control+Shift+v");
  await waitFile(join(workspace, "text-paste.txt"));
  assert.equal(await readFile(join(workspace, "text-paste.txt"), "utf8"), "text-paste");
  return image;
}

async function waitFile(path) {
  for (let attempt = 0; attempt < 200; attempt++) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`File was not created: ${path}`);
}
