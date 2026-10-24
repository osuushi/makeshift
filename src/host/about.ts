import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, dialog, nativeTheme } from "electron";

let licenses: BrowserWindow | null = null;
function resources(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), ".build/release");
}
export async function showLicenses(): Promise<void> {
  if (licenses && !licenses.isDestroyed()) {
    if (process.env.MAKESHIFT_TEST_HIDDEN !== "1") licenses.show();
    return;
  }
  const path = join(resources(), "licenses/index.html");
  try {
    await readFile(path);
  } catch {
    await dialog.showMessageBox({
      message: "License notices have not been generated.",
      detail: "Run npm run release:prepare after building the app.",
      type: "info",
    });
    return;
  }
  licenses = new BrowserWindow({
    title: "Makeshift — Third-party licenses",
    width: 900,
    height: 720,
    show: process.env.MAKESHIFT_TEST_HIDDEN !== "1",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#161e29" : "#f8f9fb",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  licenses.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  licenses.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(pathToFileURL(`${join(resources(), "licenses")}/`).href))
      event.preventDefault();
  });
  licenses.on("closed", () => {
    licenses = null;
  });
  await licenses.loadFile(path);
}
export async function showAbout(): Promise<void> {
  const metadata = await readFile(join(resources(), "build.json"), "utf8")
    .then((value) => JSON.parse(value) as { timestamp: string; commit: string })
    .catch(() => null);
  const result = await dialog.showMessageBox({
    title: "About Makeshift",
    message: "Makeshift",
    detail: `${metadata?.timestamp ?? app.getVersion()}\nCAD with a coding agent\nLicensed under LGPL-2.1-or-later.\nUses Open CASCADE Technology and FreeCAD PlaneGCS.\n${metadata?.commit ?? "Development build"}`,
    buttons: ["OK", "Third-party licenses"],
    defaultId: 0,
    cancelId: 0,
  });
  if (result.response === 1) await showLicenses();
}
