import { readdir, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { app, type BrowserWindow, dialog } from "electron";
import type { DialogRequest, DirectoryListing } from "../ipad/protocol.js";

export async function showDocumentError(error: unknown): Promise<void> {
  console.error(error);
  await dialog.showMessageBox({
    type: "error",
    message: "Could not complete document operation",
    detail: String(error),
    buttons: ["OK"],
  });
}

/** The active document surface owns prompts. Paths still refer to this computer. */
export const sessionDialogs = {
  remotes: new WeakMap<BrowserWindow, (request: DialogRequest) => Promise<unknown>>(),
  async showOpenDialog(
    window: BrowserWindow,
    options: Electron.OpenDialogOptions,
  ): Promise<Electron.OpenDialogReturnValue> {
    const remote = this.remotes.get(window);
    if (!remote) return dialog.showOpenDialog(window, options);
    const path = await remote({
      kind: "open",
      title: options.title,
      defaultPath: options.defaultPath,
      directory: options.properties?.includes("openDirectory"),
      extensions: options.filters?.[0]?.extensions,
    });
    if (typeof path !== "string") return { canceled: true, filePaths: [] };
    const info = await stat(path);
    if (options.properties?.includes("openDirectory") ? !info.isDirectory() : !info.isFile())
      throw new Error("Choose a valid file or folder on the computer.");
    return { canceled: false, filePaths: [path] };
  },
  async showSaveDialog(
    window: BrowserWindow,
    options: Electron.SaveDialogOptions,
  ): Promise<Electron.SaveDialogReturnValue> {
    const remote = this.remotes.get(window);
    if (!remote) return dialog.showSaveDialog(window, options);
    const path = await remote({
      kind: "save",
      title: options.title,
      defaultPath: options.defaultPath,
      extensions: options.filters?.[0]?.extensions,
    });
    if (typeof path !== "string") return { canceled: true, filePath: "" };
    if (!isAbsolute(path) || !(await stat(dirname(path))).isDirectory())
      throw new Error("Choose a valid folder.");
    const exists = await stat(path).then(
      () => true,
      () => false,
    );
    if (exists) {
      const response = await remote({
        kind: "message",
        message: "Replace this file?",
        detail: path,
        buttons: ["Replace", "Cancel"],
        cancelId: 1,
      });
      if (response !== 0) return { canceled: true, filePath: "" };
    }
    return { canceled: false, filePath: path };
  },
  async showMessageBox(
    window: BrowserWindow,
    options: Electron.MessageBoxOptions,
  ): Promise<Electron.MessageBoxReturnValue> {
    const remote = this.remotes.get(window);
    if (!remote) return dialog.showMessageBox(window, options);
    const response = await remote({
      kind: "message",
      message: options.message,
      detail: options.detail,
      buttons: options.buttons ?? ["OK"],
      cancelId: options.cancelId,
    });
    if (
      !Number.isInteger(response) ||
      Number(response) < 0 ||
      Number(response) >= (options.buttons?.length ?? 1)
    )
      throw new Error("Invalid dialog response");
    return { response: Number(response), checkboxChecked: false };
  },
};

export async function listComputerDirectory(value: unknown): Promise<DirectoryListing> {
  let path =
    typeof value === "string" && isAbsolute(value) ? resolve(value) : app.getPath("documents");
  if (!(await stat(path).catch(() => null))?.isDirectory()) path = dirname(path);
  const entries = await readdir(path, { withFileTypes: true });
  return {
    path,
    parent: dirname(path),
    entries: entries
      .filter((entry) => !entry.name.startsWith("."))
      .map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
        directory: entry.isDirectory(),
      }))
      .sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name)),
  };
}
