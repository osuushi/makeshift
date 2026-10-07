import { app, type BrowserWindow, ipcMain } from "electron";
import type { InspectionView } from "../agent/inspection-protocol.js";
import type { DocumentOwner } from "../backend/document-owner.js";
import { ScriptSession } from "../backend/script-session.js";
import type { RemoteDocumentEditor } from "../ipad/protocol.js";
import { type CameraState, validateCameraState } from "../model/camera-state.js";
import type { DocumentCommand } from "../model/document-host.js";
import { inspectDrawing } from "./agent-inspection.js";
import type { AgentSession } from "./agent-session.js";
import { DocumentFiles } from "./document-files.js";
import { installDocumentMenu } from "./document-menu.js";
import { readInspectionView } from "./inspection-view.js";
import { hostModelRequest } from "./model-request.js";
import { sessionDialogs as dialog } from "./session-dialogs.js";

export class DocumentSession {
  updates?: { check(): void; install(): void };

  restartForUpdate(): void {
    if (!this.window) this.updates?.install();
    else this.dispatch("restart-update");
  }
  updateInstallFailed(): void {
    this.closing = false;
    this.needsRestore = false;
  }
  remote?: RemoteDocumentEditor;
  private files: DocumentFiles;
  private script: ScriptSession;
  private window: BrowserWindow | null = null;
  private busy = false;
  private closing = false;
  private needsRestore = false;
  private warning: string | undefined;
  private pending: DocumentCommand | null = null;
  constructor(
    private owner: DocumentOwner,
    private openWindow: () => Promise<void>,
    private agent: AgentSession,
  ) {
    this.files = new DocumentFiles(owner, agent.workspace);
    this.script = new ScriptSession(
      owner,
      async () => {
        if (!this.window) throw new Error("Drawing window closed");
        return this.readView(false, true);
      },
      (running, view) => {
        this.send("agent-script-state", { running, view });
      },
      () => !this.busy && !!this.window && !this.window.isDestroyed(),
      () => this.update(),
    );
    agent.script = (request, channel) => this.script.request(request, channel);
    agent.cancelScript = () => this.script.cancel();
    ipcMain.handle("agent-script-cancel", async (event) => {
      this.checkSender(event);
      this.checkDesktop();
      await this.script.cancel();
    });
    agent.documentStatus = () => this.files.status;
    agent.inspect = async (command, entity, directory) => {
      const window = this.window,
        root = agent.workspace.root;
      if (!window || this.busy || this.script.busy)
        throw new Error("Finish the file operation or script before inspection.");
      return inspectDrawing(
        owner,
        window,
        command,
        entity,
        directory,
        () => !this.busy && this.window === window && agent.workspace.root === root,
        (render, selection, settings) => this.readView(render, false, selection, settings),
      );
    };
    agent.workspace.changed = () => this.update();
    ipcMain.handle("document-status", (event) => {
      this.checkSender(event);
      if (this.pending) {
        const command = this.pending;
        this.pending = null;
        this.dispatch(command);
      }
      return { ...this.files.status, warning: this.warning };
    });
    ipcMain.handle(
      "document-command",
      async (event, command: DocumentCommand, camera?: CameraState) => {
        this.checkSender(event);
        this.checkDesktop();
        return this.command(command, camera);
      },
    );
    app.on("before-quit", (event) => {
      if (this.closing || !this.window) return;
      event.preventDefault();
      this.dispatch("quit");
    });
  }
  checkDesktop(): void {
    if (this.remote?.active()) throw new Error("This document is controlled from the iPad.");
  }
  get status() {
    return { ...this.files.status, warning: this.warning };
  }
  private readView(
    render: boolean,
    acquireScript = false,
    selection?: string,
    settings?: string,
  ): Promise<InspectionView> {
    if (this.remote?.active())
      return this.remote.inspect(render, acquireScript, selection, settings);
    if (!this.window) throw new Error("Drawing window closed");
    return readInspectionView(this.window, render, acquireScript, selection, settings);
  }
  private send(method: string, value: unknown): void {
    if (this.remote?.active()) this.remote.emit(method, value);
    else if (this.window && !this.window.isDestroyed()) this.window.webContents.send(method, value);
  }
  async prepareRemote(): Promise<void> {
    if (this.busy || this.script.busy || this.owner.view.candidate)
      throw new Error("Finish or cancel the current operation before connecting the iPad.");
  }
  async cancelRemote(): Promise<void> {
    await this.script.cancel();
    await this.owner.call({ kind: "cancel-preview" });
    await this.owner.call({ kind: "discard" });
  }
  private checkSender(event: Electron.IpcMainInvokeEvent): void {
    if (event.sender !== this.window?.webContents || event.senderFrame !== event.sender.mainFrame)
      throw new Error("Document commands require the document window");
  }
  async restore(): Promise<void> {
    this.warning = await this.files.restore();
  }
  async reopen(): Promise<void> {
    if (this.needsRestore) await this.restore();
    this.needsRestore = false;
  }
  async model(value: unknown) {
    const request = hostModelRequest(value);
    if (this.busy) return { view: this.owner.view, error: "Finish the file operation first" };
    const reply = await this.owner.call(request);
    this.update();
    return reply;
  }
  attach(window: BrowserWindow): void {
    this.window = window;
    this.closing = false;
    window.on("page-title-updated", (event) => event.preventDefault());
    window.webContents.on("before-input-event", (event, input) => {
      // Quit remains an application shortcut even when the terminal owns editing keys.
      if (
        process.platform === "darwin" &&
        input.type === "keyDown" &&
        input.meta &&
        !input.control &&
        !input.alt &&
        !input.shift &&
        input.key.toLowerCase() === "q"
      ) {
        event.preventDefault();
        app.quit();
      }
    });
    window.on("close", (event) => {
      if (this.closing) return;
      event.preventDefault();
      this.dispatch("close");
    });
    window.on("closed", () => {
      if (this.window === window) this.window = null;
    });
    this.update();
    installDocumentMenu(
      (command) => this.dispatch(command),
      () => this.updates?.check(),
    );
  }
  private dispatch(command: DocumentCommand): void {
    if (this.remote?.active()) {
      if (
        !this.remote.connected() &&
        (command === "close" || command === "quit" || command === "restart-update")
      ) {
        void this.remote.close().then(async () => {
          const result = await this.command(command);
          if (!this.closing) this.window?.webContents.reload();
          if (result.error) console.error(result.error);
        });
      } else this.remote.emit("document-command", command);
      return;
    }
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("document-command", command);
    else if (command === "new" || command === "open") {
      this.pending = command;
      void this.openWindow();
    }
  }
  private update(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    const status = this.files.status;
    window.setTitle(`${status.name}${status.edited ? " — Edited" : ""} — Makeshift`);
    if (process.platform === "darwin") {
      window.setRepresentedFilename(status.path ?? "");
      window.setDocumentEdited(status.edited);
    }
    this.send("document-status", {
      ...status,
      warning: this.agent.workspace.error ?? this.warning,
    });
  }
  async command(
    command: DocumentCommand,
    camera?: CameraState,
  ): Promise<{ replaced: boolean; camera?: CameraState; error?: string }> {
    const window = this.window;
    if (this.busy || !window) return { replaced: false };
    this.busy = true;
    try {
      if (command === "restart-update" && !this.updates) throw new Error("Updates unavailable");
      const quitting = command === "quit" || command === "restart-update";
      await this.script.cancel();
      const view = validateCameraState(camera);
      if (command === "save" || command === "save-as") {
        if (await this.files.save(window, command === "save-as", undefined, view))
          this.warning = undefined;
      } else if (command === "new" || command === "open" || command === "close" || quitting) {
        let path: string | undefined;
        if (command === "open") {
          const result = await dialog.showOpenDialog(window, {
            properties: ["openFile"],
            defaultPath: this.files.directory,
            filters: [{ name: "Makeshift Document", extensions: ["makeshift", "freac"] }],
          });
          if (result.canceled || !result.filePaths[0]) return { replaced: false };
          path = result.filePaths[0];
        }
        const prepared = path ? await this.files.prepare(path) : undefined;
        if (!(await this.leaveDocument(window, command === "close" || quitting, view)))
          return { replaced: false };
        if (command === "new") await this.files.new();
        if (path) await this.files.open(path, prepared);
        this.agent.reset();
        this.warning = undefined;
        if (command === "close" || quitting) {
          this.needsRestore = true;
          this.closing = true;
          if (command === "restart-update") this.updates?.install();
          else if (command === "quit") app.quit();
          else window.close();
        }
        return { replaced: command === "new" || command === "open", camera: this.files.camera };
      } else throw new Error("Unknown document command");
      return { replaced: false };
    } catch (error) {
      this.closing = false;
      return { replaced: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.agent.endReplacement();
      this.busy = false;
      this.update();
    }
  }
  private async leaveDocument(
    window: BrowserWindow,
    closing: boolean,
    camera?: CameraState,
  ): Promise<boolean> {
    if (closing) {
      // Stop first so the ordinary unsaved-work choice includes final agent writes.
      await this.agent.stop();
      const final = await this.files.replacementChoice(window);
      return (
        final === "clean" ||
        final === "discard" ||
        (final === "save" && (await this.files.save(window, false, undefined, camera)))
      );
    }
    const choice = await this.files.replacementChoice(window);
    if (choice === "cancel" || !(await this.agent.mayReplace())) return false;
    if (choice === "save") return this.files.save(window, false, () => this.agent.stop(), camera);
    await this.agent.stop();
    if (choice === "discard") return true;
    // A process can write while the stop confirmation is visible or during shutdown.
    const final = await this.files.replacementChoice(window);
    return (
      final === "clean" ||
      final === "discard" ||
      (final === "save" && (await this.files.save(window, false, undefined, camera)))
    );
  }
}
