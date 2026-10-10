import { BrowserWindow, ipcMain, nativeImage, shell } from "electron";
import { captureFixture } from "../backend/fixture-capture.js";

/** Only the most recent capture from this window can be dragged or revealed. */
export function installFixtureCapture(
  checkDesktop: (sender: Electron.WebContents) => void,
  iconPath: string,
): void {
  const captures = new WeakMap<Electron.WebContents, string>();
  const allowed = (event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) =>
    event.senderFrame === event.sender.mainFrame && !!BrowserWindow.fromWebContents(event.sender);
  ipcMain.handle("capture-fixture", async (event, snapshot: unknown) => {
    if (!allowed(event)) throw new Error("Fixture capture requires the document window");
    checkDesktop(event.sender);
    const saved = await captureFixture(snapshot);
    captures.set(event.sender, saved.path);
    return saved;
  });
  ipcMain.on("drag-fixture", (event) => {
    const file = captures.get(event.sender);
    if (!allowed(event) || !file) return;
    event.sender.startDrag({
      file,
      icon: nativeImage.createFromPath(iconPath).resize({ width: 48, height: 48 }),
    });
  });
  ipcMain.on("reveal-fixture", (event) => {
    const file = captures.get(event.sender);
    if (allowed(event) && file) shell.showItemInFolder(file);
  });
}
