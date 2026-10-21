import { dirname, join } from "node:path";
import { app, type BrowserWindow, type DownloadItem, type Event, type WebContents } from "electron";

/** Each document window proposes its own folder for native geometry exports. */
export function exportDestination(window: BrowserWindow, documentPath: () => string | null): void {
  const session = window.webContents.session;
  const download = (_event: Event, item: DownloadItem, contents: WebContents) => {
    if (contents !== window.webContents || !/\.(stl|3mf|step)$/i.test(item.getFilename())) return;
    const path = documentPath();
    item.setSaveDialogOptions({
      defaultPath: join(path ? dirname(path) : app.getPath("documents"), item.getFilename()),
    });
  };
  session.on("will-download", download);
  window.once("closed", () => session.off("will-download", download));
}
