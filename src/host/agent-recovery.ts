import type { BrowserWindow } from "electron";
import type { AgentWorkspace } from "./agent-workspace.js";
import { sessionDialogs as dialog } from "./session-dialogs.js";
import { recoverWorkspaceFiles } from "./workspace-recovery.js";

/** Recover portable files into this document without replacing its geometry. */
export async function recoverAgentFiles(
  window: BrowserWindow,
  workspace: AgentWorkspace,
  settingsDirectory: string,
  disconnect: () => Promise<void>,
): Promise<void> {
  const choice = await dialog.showOpenDialog(window, {
    properties: ["openDirectory"],
    title: "Recover agent workspace",
    defaultPath: workspace.directory,
    message:
      "Choose a retained document folder. Its files and conversations replace this document's agent workspace; geometry is unchanged.",
  });
  if (!choice.canceled && choice.filePaths[0]) {
    const files = await recoverWorkspaceFiles(choice.filePaths[0], settingsDirectory);
    if (!Object.keys(files).length) throw new Error("This folder has no recoverable agent files.");
    const confirmed = await dialog.showMessageBox(window, {
      message: "Replace this document's agent files with the recovered files?",
      detail:
        "Current local files remain in their recovery folder. Save this document to keep the recovered files.",
      buttons: ["Recover", "Cancel"],
      defaultId: 1,
      cancelId: 1,
    });
    if (confirmed.response === 0) {
      await disconnect();
      workspace.recovered(await workspace.prepare(files), files);
    }
  }
}
