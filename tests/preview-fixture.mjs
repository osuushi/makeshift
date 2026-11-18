import { join, resolve } from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { AgentPreview } from "../.build/host/host/agent-preview.js";
import { AgentWorkspace } from "../.build/host/host/agent-workspace.js";
import { workspaceSnapshot } from "../.build/host/host/workspace-files.js";
import {
  readPortableArchive,
  writePortableArchive,
} from "../.build/host/model/portable-archive.js";

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
  let directory = process.env.PREVIEW_TEST_ROOT;
  const host = new AgentPreview(window, () => directory);
  globalThis.previewTest = host;
  const destination = new AgentWorkspace(join(directory, "copies"));
  let archive;
  globalThis.savePreviewDrawing = async () => {
    await host.settled();
    archive = writePortableArchive(
      JSON.stringify({ document: { sketches: [] } }),
      await workspaceSnapshot(directory, true),
    );
  };
  globalThis.reopenPreviewDrawing = async () => {
    const { files } = readPortableArchive(archive);
    directory = join(await destination.prepare(files), "workspace");
    await host.restore(files);
  };
  await window.loadFile(resolve(".cache/preview-ui/tests/preview-fixture.html"));
});
