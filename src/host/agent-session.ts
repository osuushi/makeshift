import { join } from "node:path";
import { app, type BrowserWindow, clipboard, ipcMain } from "electron";
import type { InspectionCommand } from "../agent/inspection-protocol.js";
import type { AgentReply, AgentRequest } from "../agent/protocol.js";
import type { ScriptRequest } from "../agent-script/api.js";
import type { DocumentStatus } from "../model/document-host.js";
import { attachAgentFile } from "./agent-attachments.js";
import type { AgentConnection } from "./agent-connection.js";
import { agentExecutable } from "./agent-executable.js";
import { orientationOverrides, prepareOrientation } from "./agent-orientation.js";
import { AgentProcess } from "./agent-process.js";
import {
  AgentSettings,
  codexPermissionOverrides,
  personalSkillOverrides,
  workspaceTrustOverride,
} from "./agent-settings.js";
import { AgentSetup } from "./agent-setup.js";
import { prepareAgentSkills } from "./agent-skills.js";
import { AgentWorkspace } from "./agent-workspace.js";
import { codexResumeArgs, copyCodexLocalState } from "./codex-workspace.js";
import { nativeExecutable } from "./native-paths.js";
import { sessionDialogs as dialog } from "./session-dialogs.js";
import { recoverWorkspaceFiles } from "./workspace-recovery.js";

export class AgentSession {
  canUseDesktop = () => true;
  private process = new AgentProcess(nativeExecutable("agent-scope"));
  private settings = new AgentSettings(app.getPath("userData"));
  readonly setup = new AgentSetup(this.settings, app);
  readonly workspace = new AgentWorkspace(join(app.getPath("userData"), "agent", "workspaces"));
  private codexHome: string | null = null;
  private window: BrowserWindow | null = null;
  private busy = false;
  private replacing = false;
  private connection: AgentConnection | null = null;
  script = async (_request: ScriptRequest, _channel: string): Promise<unknown> => {
    throw new Error("Document not attached");
  };
  cancelScript = async (): Promise<void> => {};
  documentStatus = (): DocumentStatus => {
    throw new Error("The document is not attached.");
  };
  inspect = async (
    _command: InspectionCommand,
    _entity: string | undefined,
    _directory: string,
  ): Promise<unknown> => {
    throw new Error("The document is not attached.");
  };
  constructor() {
    ipcMain.handle("agent", async (event, request: AgentRequest) => {
      if (event.sender !== this.window?.webContents || event.senderFrame !== event.sender.mainFrame)
        throw new Error("Agent commands require the document window.");
      try {
        if (!this.canUseDesktop()) throw new Error("This document is controlled from the iPad.");
        return await this.request(request);
      } catch (error) {
        return { ...this.status, error: error instanceof Error ? error.message : String(error) };
      }
    });
  }
  get status(): AgentReply {
    return { ...this.process.status, workspace: this.workspace.cwd, setup: this.setup.status };
  }
  attach(window: BrowserWindow): void {
    this.window = window;
    window.webContents.on("did-finish-load", () =>
      window.webContents.setIgnoreMenuShortcuts(false),
    );
    window.webContents.on("render-process-gone", () => {
      void this.stop()
        .catch(console.error)
        .finally(() => this.endReplacement());
    });
  }
  async request(request: AgentRequest): Promise<AgentReply> {
    if (!request || typeof request !== "object") throw new Error("Invalid agent request.");
    if (request.kind === "read") {
      if (!this.busy && !this.process.status.running) await this.disconnect();
      return { ...this.status, output: this.process.read() };
    }
    if (request.kind === "clipboard")
      return { ...this.status, clipboardText: await clipboard.readText() };
    if (request.kind === "focus") {
      this.window?.webContents.setIgnoreMenuShortcuts(request.focused === true);
      return this.status;
    }
    if (request.kind === "write") {
      if (typeof request.data !== "string" || request.data.length > 64 * 1024)
        throw new Error("Terminal input is too large.");
      this.process.write(request.data);
      return this.status;
    }
    if (request.kind === "resize") {
      this.dimensions(request.cols, request.rows);
      this.process.resize(request.cols, request.rows);
      return this.status;
    }
    if (request.kind === "cancel-codex-install") {
      await this.setup.request(request);
      return this.status;
    }
    if (this.setup.conflicts(request))
      throw new Error("Wait for or cancel Codex installation before changing agent setup.");
    if (this.busy || this.replacing)
      throw new Error("An agent lifecycle operation is already in progress.");
    this.busy = true;
    try {
      return await this.lifecycle(request);
    } finally {
      this.busy = false;
    }
  }
  private async lifecycle(request: AgentRequest): Promise<AgentReply> {
    const window = this.window;
    if (!window) throw new Error("The document window is closed.");
    if (await this.setup.request(request, this.process.status.running)) return this.status;
    switch (request.kind) {
      case "settings":
        return {
          ...this.status,
          preferences: await this.settings.read(),
          stateDirectory: this.settings.directory,
        };
      case "configure":
        return { ...this.status, preferences: await this.settings.save(request.preferences) };
      case "browse": {
        const result = await dialog.showOpenDialog(window, {
          properties: ["openFile"],
          title: "Choose agent executable",
        });
        return { ...this.status, executable: result.canceled ? undefined : result.filePaths[0] };
      }
      case "recover":
        return this.recover(window);
      case "attach": {
        const attachment = await attachAgentFile(this.workspace, request.name, request.base64);
        return { ...this.status, attachment };
      }
      case "start":
        return this.start(request);
      case "stop":
        await this.stopProcess();
        return this.status;
      default:
        throw new Error("Unknown agent request.");
    }
  }
  private async recover(window: BrowserWindow): Promise<AgentReply> {
    if (this.process.status.running) throw new Error("Stop the agent before recovering files.");
    const choice = await dialog.showOpenDialog(window, {
      properties: ["openDirectory"],
      title: "Recover agent workspace",
      defaultPath: this.workspace.directory,
      message:
        "Choose a retained document folder. Its files and conversations replace this document's agent workspace; geometry is unchanged.",
    });
    if (!choice.canceled && choice.filePaths[0]) {
      const files = await recoverWorkspaceFiles(choice.filePaths[0], this.settings.directory);
      if (!Object.keys(files).length)
        throw new Error("This folder has no recoverable agent files.");
      const confirmed = await dialog.showMessageBox(window, {
        message: "Replace this document's agent files with the recovered files?",
        detail:
          "Current local files remain in their recovery folder. Save this document to keep the recovered files.",
        buttons: ["Recover", "Cancel"],
        defaultId: 1,
        cancelId: 1,
      });
      if (confirmed.response === 0) {
        await this.disconnect();
        this.workspace.recovered(await this.workspace.prepare(files), files);
      }
    }
    return this.status;
  }
  private async start(request: Extract<AgentRequest, { kind: "start" }>): Promise<AgentReply> {
    if (this.process.status.running) return this.status;
    await this.disconnect();
    if (this.codexHome) {
      await copyCodexLocalState(this.codexHome, this.settings.directory);
      this.codexHome = null;
    }
    this.dimensions(request.cols, request.rows);
    const preferences = await this.settings.read();
    const env = await this.settings.environment(preferences);
    await this.workspace.ensure();
    const cwd = this.workspace.cwd;
    if (!cwd) throw new Error("Workspace was not created.");
    let resume: string[] = [];
    if (preferences.preset === "codex") {
      const home = this.workspace.codexHome;
      if (!home) throw new Error("Codex workspace was not created.");
      await copyCodexLocalState(this.settings.directory, home);
      await prepareAgentSkills(home, app.getAppPath());
      env.CODEX_HOME = home;
      this.codexHome = home;
      resume = codexResumeArgs(await this.workspace.snapshot(), cwd);
    }
    try {
      this.connection = await prepareOrientation(
        cwd,
        env,
        () => {
          if (this.workspace.cwd !== cwd) throw new Error("This Makeshift connection has closed.");
          return this.documentStatus();
        },
        (command, entity, directory) => this.inspect(command, entity, directory),
        (request, channel) => this.script(request, channel),
      );
      const overrides =
        preferences.preset === "codex"
          ? [
              ...(await personalSkillOverrides()),
              ...(await workspaceTrustOverride(cwd)),
              ...orientationOverrides(env),
            ]
          : [];
      const executable =
        preferences.preset === "codex"
          ? await this.setup.executable(preferences, cwd, env)
          : await agentExecutable(preferences.executable, cwd, env);
      await this.process.start(
        executable,
        [
          ...(preferences.preset === "codex" ? (resume.length ? resume : ["--cd", cwd]) : []),
          ...(preferences.preset === "codex" ? codexPermissionOverrides() : []),
          ...preferences.args,
          ...overrides,
        ],
        cwd,
        env,
        request.cols,
        request.rows,
      );
    } catch (error) {
      await this.disconnect();
      throw new Error(
        `Could not start “${preferences.executable}”. Check its path and arguments in Settings. ${String(error)}`,
      );
    }
    return this.status;
  }
  private dimensions(cols: number, rows: number): void {
    if (![cols, rows].every((value) => Number.isInteger(value) && value >= 2 && value <= 500))
      throw new Error("Invalid terminal dimensions.");
  }
  async mayReplace(): Promise<boolean> {
    const window = this.window;
    if (!window) return false;
    if (this.busy) return false;
    if (!this.process.status.running) return true;
    const { response } = await dialog.showMessageBox(window, {
      type: "question",
      message: "Stop the agent before leaving this document?",
      detail: "The agent must stop before the final save or document replacement.",
      buttons: ["Stop and continue", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    return response === 0;
  }
  async stop(): Promise<void> {
    if (this.busy) throw new Error("Wait for the agent lifecycle operation to finish.");
    this.replacing = true;
    this.busy = true;
    try {
      await this.stopProcess();
    } finally {
      this.busy = false;
    }
  }
  reset(): void {
    this.process = new AgentProcess(nativeExecutable("agent-scope"));
    this.window?.webContents.setIgnoreMenuShortcuts(false);
  }
  endReplacement(): void {
    this.replacing = false;
  }
  private async stopProcess(): Promise<void> {
    await this.disconnect();
    await this.process.stop();
    if (this.codexHome) {
      await copyCodexLocalState(this.codexHome, this.settings.directory);
      this.codexHome = null;
    }
    await this.workspace.refresh();
  }
  private async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    await this.cancelScript();
    await connection?.close();
  }
}
