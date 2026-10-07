import { randomUUID } from "node:crypto";
import { type BrowserWindow, ipcMain } from "electron";
import type { InspectionView } from "../agent/inspection-protocol.js";

/** One bounded request to the document renderer, never arbitrary JavaScript evaluation. */
export function readInspectionView(
  window: BrowserWindow,
  render: boolean,
  acquireScript = false,
  selection?: string,
  settings?: string,
): Promise<InspectionView> {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const finish = (error?: Error, view?: InspectionView) => {
      clearTimeout(timer);
      ipcMain.removeListener("agent-inspection-reply", reply);
      window.webContents.removeListener("destroyed", closed);
      if (error) reject(error);
      else if (view) resolve(view);
    };
    const closed = () => finish(new Error("The drawing window closed."));
    const reply = (
      event: Electron.IpcMainEvent,
      value: { id?: string; view?: InspectionView; error?: string },
    ) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== event.sender.mainFrame ||
        value?.id !== id
      )
        return;
      if (value.error) finish(new Error(value.error));
      else if (!value.view || !Array.isArray(value.view.selection))
        finish(new Error("Invalid inspection response."));
      else finish(undefined, value.view);
    };
    const timer = setTimeout(
      () => finish(new Error("The drawing did not respond to inspection.")),
      5000,
    );
    ipcMain.on("agent-inspection-reply", reply);
    window.webContents.once("destroyed", closed);
    window.webContents.send("agent-inspection-read", {
      id,
      render,
      acquireScript,
      selection,
      settings,
    });
  });
}
