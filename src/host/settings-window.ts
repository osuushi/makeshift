import { join } from "node:path";
import { BrowserWindow } from "electron";
import type { DocumentCommand } from "../model/document-host.js";
import { lockInterfaceZoom } from "./interface-zoom.js";

let settings: BrowserWindow | undefined;
export async function openSettingsWindow(directory: string): Promise<void> {
  if (settings && !settings.isDestroyed()) {
    if (settings.isMinimized()) settings.restore();
    if (process.env.MAKESHIFT_TEST_HIDDEN !== "1") {
      settings.show();
      settings.focus();
    }
    return;
  }
  const hidden = process.env.MAKESHIFT_TEST_HIDDEN === "1";
  const window = new BrowserWindow({
    title: "Settings — Makeshift",
    width: 760,
    height: 760,
    minWidth: 400,
    minHeight: 400,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  settings = window;
  lockInterfaceZoom(window.webContents);
  window.setMenu(null);
  window.on("closed", () => {
    if (settings === window) settings = undefined;
  });
  try {
    const url = process.env.MAKESHIFT_DEV_URL;
    if (url) await window.loadURL(new URL("settings.html", url).href);
    else await window.loadFile(join(directory, "../renderer/settings.html"));
    if (!hidden) window.show();
  } catch (error) {
    window.destroy();
    throw error;
  }
}

/** Keep document menu commands from modifying the last drawing behind Settings. */
export function routeSettingsCommand(command: DocumentCommand): boolean {
  if (!settings || BrowserWindow.getFocusedWindow() !== settings) return false;
  if (["quit", "restart-update", "new", "open"].includes(command)) return false;
  if (command === "close") settings.close();
  return true;
}
