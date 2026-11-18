import { fileURLToPath } from "node:url";
import { BrowserWindow, nativeTheme, screen } from "electron";
import type { ContentPrompt } from "../security/content-trust.js";
import { DocumentIPC } from "./document-ipc.js";

export async function showTrustWindow(
  parent: BrowserWindow,
  prompt: ContentPrompt,
): Promise<number> {
  if (parent.isDestroyed()) return prompt.cancelId;
  const { width, height } = screen.getDisplayMatching(parent.getBounds()).workArea;
  const hidden = process.env.MAKESHIFT_TEST_HIDDEN === "1";
  const window = new BrowserWindow({
    parent,
    modal: true,
    title: "Content trust — Makeshift",
    width: Math.min(580, width),
    height: Math.min(440, height),
    show: false,
    resizable: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#161e29" : "#f8f9fb",
    webPreferences: {
      preload: fileURLToPath(new URL("../trust-preload.cjs", import.meta.url)),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  window.setMenu(null);
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.once("render-process-gone", () => window.destroy());
  const response = new Promise<number>((resolve) => {
    window.once("closed", () => resolve(prompt.cancelId));
    const ipc = new DocumentIPC();
    ipc.handle("trust-prompt-read", () => prompt);
    ipc.handle("trust-prompt-choose", (_event, choice: number) => {
      if (!Number.isInteger(choice) || choice < 0 || choice >= prompt.buttons.length)
        throw new Error("Invalid trust response");
      resolve(choice);
    });
    ipc.attach(window);
  });
  try {
    const dev = process.env.MAKESHIFT_DEV_URL;
    if (dev) await window.loadURL(new URL("trust.html", dev).href);
    else
      await window.loadFile(fileURLToPath(new URL("../../renderer/trust.html", import.meta.url)));
    if (!hidden && !window.isDestroyed()) window.show();
    return await response;
  } catch (error) {
    if (window.isDestroyed()) return prompt.cancelId;
    throw error;
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}
