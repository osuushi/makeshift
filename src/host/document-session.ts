import { app, type BrowserWindow } from "electron";
import type { InspectionView } from "../agent/inspection-protocol.js";
import type { DocumentOwner } from "../backend/document-owner.js";
import { ScriptSession } from "../backend/script-session.js";
import type { RemoteDocumentEditor } from "../ipad/protocol.js";
import { type CameraState, validateCameraState } from "../model/camera-state.js";
import type { DocumentCommand } from "../model/document-host.js";
import { inspectDrawing } from "./agent-inspection.js";
import type { AgentSession } from "./agent-session.js";
import { DocumentFiles } from "./document-files.js";
import { DocumentIPC } from "./document-ipc.js";
import { readInspectionView } from "./inspection-view.js";
import { hostModelRequest } from "./model-request.js";

export class DocumentSession {
  private ipc = new DocumentIPC();
  private quitReady = false;
  private quitReply: ((ready: boolean) => void) | null = null;
  private quitTimer: ReturnType<typeof setTimeout> | undefined;
  async prepareToQuit(): Promise<boolean> {
    if (this.busy || this.quitReply) return false;
    this.quitReady = false;
    return new Promise((resolve) => {
      this.quitReply = resolve;
      this.quitTimer = setTimeout(() => this.commandFinished("quit"), 10000);
      this.dispatch("quit");
    });
  }
  commandFinished(command: DocumentCommand): void {
    if (command !== "quit") return;
    clearTimeout(this.quitTimer);
    const reply = this.quitReply;
    this.quitReply = null;
    reply?.(this.quitReady);
  }
  resumeAfterQuit(): void {
    if (!this.quitReady) return;
    this.busy = false;
    this.quitReady = false;
    this.closing = false;
    this.agent.endReplacement();
  }
  allowUpdateClose(): void {
    this.closing = true;
  }
  closePrepared(): void {
    this.closing = true;
    this.window?.close();
  }
  remote?: RemoteDocumentEditor;
  private files: DocumentFiles;
  private script: ScriptSession;
  private window: BrowserWindow | null = null;
  private busy = false;
  private closing = false;
  private warning: string | undefined;
  private ready = false;
  private pendingCommand: DocumentCommand | null = null;
  constructor(
    private owner: DocumentOwner,
    private createDocument: (command: "new" | "open", window: BrowserWindow) => Promise<void>,
    private agent: AgentSession,
    remember: (path: string | null) => Promise<void>,
    write: (path: string, action: () => Promise<void>) => Promise<void>,
    directory: () => string,
    name: string,
  ) {
    this.files = new DocumentFiles(owner, agent.workspace, remember, write, directory, name);
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
    this.ipc.handle("agent-script-cancel", async () => {
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
    this.ipc.handle("document-status", () => {
      this.ready = true;
      if (this.pendingCommand) {
        const command = this.pendingCommand;
        this.pendingCommand = null;
        this.dispatch(command);
      }
      return { ...this.files.status, warning: this.warning };
    });
    this.ipc.handle(
      "document-command",
      async (_event, command: DocumentCommand, camera?: CameraState) => {
        this.checkDesktop();
        return this.command(command, camera);
      },
    );
    this.ipc.handle("document-command-finished", (_event, command: DocumentCommand) => {
      this.commandFinished(command);
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
  async openPath(path: string): Promise<void> {
    await this.files.open(path);
    this.update();
  }
  async model(value: unknown) {
    const request = hostModelRequest(value);
    if (this.busy) return { view: this.owner.view, error: "Finish the file operation first" };
    const reply = await this.owner.call(request);
    this.update();
    return reply;
  }
  attach(window: BrowserWindow): void {
    this.ipc.attach(window);
    this.window = window;
    this.closing = false;
    window.webContents.on("did-start-loading", () => {
      if (this.ready) this.commandFinished("quit");
      this.ready = false;
    });
    window.webContents.on("render-process-gone", () => this.commandFinished("quit"));
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
      this.commandFinished("quit");
    });
    this.update();
  }
  dispatch(command: DocumentCommand): void {
    if (this.remote?.active()) {
      if (
        !this.remote.connected() &&
        (command === "close" || command === "quit" || command === "restart-update")
      ) {
        void this.remote.close().then(async () => {
          const result = await this.command(command);
          if (!this.closing && command !== "quit") this.window?.webContents.reload();
          this.commandFinished(command);
          if (result.error) console.error(result.error);
        });
      } else this.remote.emit("document-command", command);
      return;
    }
    if (!this.ready) {
      this.pendingCommand = command;
      return;
    }
    if (this.window && !this.window.isDestroyed())
      this.window.webContents.send("document-command", command);
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
    if ((command === "new" || command === "open") && window) {
      try {
        await this.createDocument(command, window);
        return { replaced: false };
      } catch (error) {
        return { replaced: false, error: String(error) };
      }
    }
    if (command === "quit") clearTimeout(this.quitTimer);
    if (this.busy || !window) return { replaced: false };
    this.busy = true;
    try {
      const quitting = command === "quit" || command === "restart-update";
      await this.script.cancel();
      const view = validateCameraState(camera);
      if (command === "save" || command === "save-as") {
        if (await this.files.save(window, command === "save-as", undefined, view))
          this.warning = undefined;
      } else if (command === "close" || quitting) {
        if (quitting && !this.quitReply) return { replaced: false };
        if (!(await this.leaveDocument(window, view))) return { replaced: false };
        this.warning = undefined;
        if (quitting) {
          if (!this.quitReply) return { replaced: false };
          this.quitReady = true;
        } else {
          this.closing = true;
          window.close();
        }
        return { replaced: false };
      } else throw new Error("Unknown document command");
      return { replaced: false };
    } catch (error) {
      this.closing = false;
      return { replaced: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (!this.quitReady) this.agent.endReplacement();
      this.busy = this.quitReady;
      this.update();
    }
  }
  private async leaveDocument(window: BrowserWindow, camera?: CameraState): Promise<boolean> {
    // Stop first so the ordinary unsaved-work choice includes final agent writes.
    await this.agent.stop();
    const choice = await this.files.replacementChoice(window);
    return (
      choice === "clean" ||
      choice === "discard" ||
      (choice === "save" && (await this.files.save(window, false, undefined, camera)))
    );
  }
}
