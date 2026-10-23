import { join } from "node:path";
import { BrowserWindow, screen } from "electron";
import type { DocumentCommand } from "../model/document-host.js";
import { DocumentIPC } from "./document-ipc.js";
import { lockInterfaceZoom } from "./interface-zoom.js";
import { settingsBounds } from "./settings-bounds.js";

let settings: BrowserWindow | undefined;
let toolboxTools: { id: string; label: string; description?: string; unavailable: null }[] = [];
export async function openSettingsWindow(directory: string, input: unknown): Promise<void> {
  if (
    !Array.isArray(input) ||
    input.some((tool) => !tool || typeof tool.id !== "string" || typeof tool.label !== "string")
  )
    throw new Error("Invalid settings tool catalog");
  toolboxTools = input.map(({ id, label, description }) => ({
    id,
    label,
    description: typeof description === "string" ? description : undefined,
    unavailable: null,
  }));
  if (settings && !settings.isDestroyed()) {
    settings.webContents.send("settings-tools", toolboxTools);
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
    width: 520,
    height: 520,
    minWidth: 400,
    minHeight: 260,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: join(directory, "settings-preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const ipc = new DocumentIPC();
  ipc.handle("settings-fit", (_event, height: unknown) => {
    if (typeof height !== "number" || !Number.isFinite(height)) return;
    const bounds = window.getBounds();
    const frame = bounds.height - window.getContentBounds().height;
    const work = screen.getDisplayMatching(bounds).workArea;
    window.setBounds(settingsBounds(bounds, Math.ceil(height), frame, work));
  });
  ipc.handle("settings-tools", () => toolboxTools);
  ipc.attach(window);
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
