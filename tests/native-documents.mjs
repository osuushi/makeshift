import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron } from "playwright";
import { installTestFrames } from "./ui-test-frames.mjs";
import { chooseTool } from "./ui-tools.mjs";

/** Linux CI has no physical GPU; keep software WebGL consistent across test launchers. */
export function electronTestArguments(args) {
  return [
    ...args,
    ...(process.platform === "linux"
      ? ["--use-gl=angle", "--use-angle=swiftshader-webgl", "--enable-unsafe-swiftshader"]
      : []),
  ];
}

const sessions = new WeakMap();
export const electronSession = (page) => sessions.get(page);
/** Existing geometry suites discard between cases; lifecycle tests answer prompts explicitly. */
export async function launchElectron(options) {
  const directory = await mkdtemp(join(tmpdir(), "makeshift-ui-"));
  let app;
  try {
    app = await _electron.launch({
      ...options,
      args: [...electronTestArguments(options.args), `--user-data-dir=${directory}`],
    });
    const close = app.close.bind(app);
    app.close = async () => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        app.process().kill("SIGKILL");
      }, 10000);
      try {
        await close();
        if (timedOut) throw new Error("Owned Electron UI cleanup timed out");
      } finally {
        clearTimeout(timeout);
        await rm(directory, { recursive: true, force: true });
      }
    };
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 2 });
    });
    const firstWindow = app.firstWindow.bind(app);
    app.firstWindow = async (...args) => {
      const page = await firstWindow(...args);
      await installTestFrames(page);
      sessions.set(page, { app, directory });
      return page;
    };
    return app;
  } catch (error) {
    await app?.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

export async function openDocument(page, file) {
  const session = sessions.get(page);
  if (!session) {
    const chooser = page.waitForEvent("filechooser");
    await chooseTool(page, "open document", "open");
    await (await chooser).setFiles(file);
    const discard = page
      .getByRole("dialog", { name: "Unsaved changes" })
      .getByRole("button", { name: "Don’t Save", exact: true });
    if (await discard.isVisible()) await discard.click();
    return;
  }
  let path = file;
  if (typeof file !== "string") {
    path = join(session.directory, "fixture.makeshift");
    await writeFile(path, file.buffer);
  }
  await session.app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, path);
  await chooseTool(page, "open document", "open");
  await page.waitForFunction(() => !window.makeshiftInspect().busy);
}

export async function saveDocument(page, path) {
  const session = sessions.get(page);
  if (!session) {
    // Exercise the download path without opening an OS save panel in a headless test.
    await page.evaluate(() => {
      window.showSaveFilePicker = undefined;
    });
    const downloaded = page.waitForEvent("download");
    await chooseTool(page, "save document", "save");
    await (await downloaded).saveAs(path);
    return;
  }
  await session.app.evaluate(({ dialog, Menu }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    Menu.getApplicationMenu()
      .items.find((item) => item.label === "File")
      .submenu.items.find((item) => item.label === "Save As…")
      .click();
  }, path);
  for (let attempt = 0; attempt < 200; attempt++) {
    const saved = await page.evaluate(async (path) => {
      const status = await window.makeshiftDocument.status();
      return status.path === path && !status.edited && !window.makeshiftInspect().busy;
    }, path);
    if (saved) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Save did not complete: ${path}`);
}

export async function exportDocument(page, format, path, stepChoice) {
  const session = sessions.get(page);
  const waiting = session
    ? session.app.evaluate(
        ({ BrowserWindow }, path) =>
          new Promise((resolve, reject) => {
            BrowserWindow.getAllWindows()[0].webContents.session.once(
              "will-download",
              (_, item) => {
                item.setSavePath(path);
                item.once("done", (_, state) =>
                  state === "completed" ? resolve(null) : reject(new Error(state)),
                );
              },
            );
          }),
        path,
      )
    : page.waitForEvent("download");
  await chooseTool(page, `export ${format}`, `export-${format}`);
  if (stepChoice)
    await page
      .getByRole("dialog", { name: "STEP export with decorators" })
      .getByRole("button", { name: stepChoice, exact: true })
      .click();
  const download = await waiting;
  if (download) await download.saveAs(path);
}

/** Exercise the ordinary native Edit menu or the browser File/Edit menu. */
export async function historyMenu(page, direction = "undo") {
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  const session = sessions.get(page);
  if (session) {
    await session.app.evaluate(({ Menu }, direction) => {
      const label = direction === "undo" ? "Undo" : "Redo";
      Menu.getApplicationMenu()
        .items.find((item) => item.label === "Edit")
        .submenu.items.find((item) => item.label === label)
        .click();
    }, direction);
  } else {
    await page.getByRole("button", { name: "File / Edit", exact: true }).click();
    await page
      .getByRole("menu", { name: "File and edit", exact: true })
      .locator(`[data-command="${direction}"]`)
      .click();
  }
}
