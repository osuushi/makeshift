import { resolve } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { AgentPreview } from "../.build/host/host/agent-preview.js";

ipcMain.on("startup-animation", (event) => {
  event.returnValue = false;
});
app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      preload: resolve(".build/host/preload.cjs"),
      sandbox: true,
      contextIsolation: true,
    },
  });
  globalThis.previewTest = new AgentPreview(window, () => process.env.PREVIEW_TEST_ROOT);
  await window.loadFile(resolve(".cache/preview-ui/tests/preview-fixture.html"));
});
