import { Menu } from "electron";
import type { DocumentCommand } from "../model/document-host.js";
import { showAbout, showLicenses } from "./about.js";

export function installDocumentMenu(
  dispatch: (command: DocumentCommand) => void,
  checkUpdates: () => void,
): void {
  const item = (label: string, accelerator: string, command: DocumentCommand) => ({
    label,
    accelerator,
    click: () => dispatch(command),
  });
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === "darwin"
        ? [
            {
              label: "Makeshift",
              submenu: [
                { label: "About Makeshift", click: () => void showAbout() },
                { label: "Check for Updates…", click: checkUpdates },
                { type: "separator" as const },
                { role: "services" as const },
                { type: "separator" as const },
                { role: "hide" as const },
                { role: "hideOthers" as const },
                { role: "unhide" as const },
                { type: "separator" as const },
                { role: "quit" as const },
              ],
            },
          ]
        : []),
      {
        label: "File",
        submenu: [
          item("New", "CmdOrCtrl+N", "new"),
          item("Open…", "CmdOrCtrl+O", "open"),
          { role: "recentDocuments", submenu: [{ role: "clearRecentDocuments" }] },
          { type: "separator" },
          item("Save", "CmdOrCtrl+S", "save"),
          item("Save As…", "CmdOrCtrl+Shift+S", "save-as"),
          { type: "separator" },
          item("Close", "CmdOrCtrl+W", "close"),
          ...(process.platform !== "darwin" ? [{ role: "quit" as const }] : []),
        ],
      },
      {
        label: "Edit",
        submenu: [
          item("Undo", "CmdOrCtrl+Z", "undo"),
          item("Redo", "CmdOrCtrl+Shift+Z", "redo"),
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload", accelerator: "CmdOrCtrl+Shift+R" },
          { role: "forceReload", accelerator: "CmdOrCtrl+Alt+Shift+R" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      { role: "windowMenu" },
      {
        label: "Help",
        submenu: [
          { label: "About Makeshift", click: () => void showAbout() },
          { label: "Third-party licenses", click: () => void showLicenses() },
        ],
      },
    ]),
  );
}
