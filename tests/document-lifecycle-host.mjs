import { _electron } from "playwright";
import { electronTestArguments } from "./native-documents.mjs";
import { settled } from "./ui-helpers.mjs";

// Owned app/profile plumbing for the multi-document lifecycle acceptance.
export async function closeDocuments(current) {
  const timer = setTimeout(() => current.process().kill("SIGKILL"), 15000);
  try {
    await current.close();
  } finally {
    clearTimeout(timer);
  }
}
export async function launchDocuments(profile) {
  const app = await _electron.launch({
    args: electronTestArguments([".", `--user-data-dir=${profile}`]),
    env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
  });
  try {
    await app.evaluate(({ dialog, BrowserWindow }) => {
      // Hidden windows cannot acquire OS focus; exercise routing via their native focus events.
      BrowserWindow.getFocusedWindow = () => null;
      globalThis.answers = [];
      globalThis.promptNames = [];
      globalThis.savePath = undefined;
      globalThis.openPaths = [];
      dialog.showMessageBox = async (_window, options) => {
        const value = options ?? _window;
        globalThis.promptNames.push(value.message);
        return { response: globalThis.answers.shift() ?? 2 };
      };
      dialog.showSaveDialog = async () => ({
        canceled: !globalThis.savePath,
        filePath: globalThis.savePath,
      });
      dialog.showOpenDialog = async () => ({
        canceled: !globalThis.openPaths.length,
        filePaths: globalThis.openPaths.splice(0),
      });
    });
    const page = await app.firstWindow();
    page.setDefaultTimeout(15000);
    await settled(page);
    return { app, page };
  } catch (error) {
    await closeDocuments(app);
    throw error;
  }
}
