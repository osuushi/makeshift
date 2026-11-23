import { type BrowserWindow, dialog } from "electron";
import { showTrustWindow } from "./trust-window.js";

export async function showDocumentError(error: unknown): Promise<void> {
  console.error(error);
  await dialog.showMessageBox({
    type: "error",
    message: "Could not complete document operation",
    detail: String(error),
    buttons: ["OK"],
  });
}

export const sessionDialogs = {
  showOpenDialog(window: BrowserWindow, options: Electron.OpenDialogOptions) {
    return dialog.showOpenDialog(window, options);
  },
  showSaveDialog(window: BrowserWindow, options: Electron.SaveDialogOptions) {
    return dialog.showSaveDialog(window, options);
  },
  async showMessageBox(
    window: BrowserWindow,
    options: Electron.MessageBoxOptions & { fingerprint?: string },
  ): Promise<Electron.MessageBoxReturnValue> {
    if (options.fingerprint) {
      const response = await showTrustWindow(window, {
        message: options.message,
        detail: options.detail,
        fingerprint: options.fingerprint,
        buttons: options.buttons ?? ["OK"],
        cancelId: options.cancelId ?? 0,
      });
      return { response, checkboxChecked: false };
    }
    return dialog.showMessageBox(window, options);
  },
};
