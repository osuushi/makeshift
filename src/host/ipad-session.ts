import { type BrowserWindow, ipcMain } from "electron";
import type { InspectionView } from "../agent/inspection-protocol.js";
import type { AgentRequest } from "../agent/protocol.js";
import { captureFixture } from "../backend/fixture-capture.js";
import type { CameraState } from "../model/camera-state.js";
import type { DocumentCommand } from "../model/document-host.js";
import type { AgentSession } from "./agent-session.js";
import type { DocumentSession } from "./document-session.js";
import { readInspectionView } from "./inspection-view.js";
import { IPadServer } from "./ipad-server.js";
import { listComputerDirectory, sessionDialogs } from "./session-dialogs.js";

export class IPadSession {
  private window: BrowserWindow | null = null;
  private server: IPadServer;
  private switching = false;
  constructor(
    root: string,
    private documents: DocumentSession,
    private agent: AgentSession,
  ) {
    this.server = new IPadServer(
      root,
      this.request,
      () => documents.cancelRemote(),
      (status) => {
        if (this.window && !this.window.isDestroyed())
          this.window.webContents.send("ipad-status", status);
      },
    );
    documents.remote = {
      active: () => this.server.active || this.switching,
      connected: () => this.server.status.connected,
      emit: (method, value) => this.server.emit(method, value),
      inspect: (render, acquireScript, selection, settings) =>
        this.server.request<InspectionView>("inspect", {
          render,
          acquireScript,
          selection,
          settings,
        }),
      close: () => this.stop(),
    };
    agent.canUseDesktop = () => !this.server.active && !this.switching;
    for (const method of ["status", "start", "stop"] as const)
      ipcMain.handle(`ipad-${method}`, async (event) => {
        if (
          event.sender !== this.window?.webContents ||
          event.senderFrame !== event.sender.mainFrame
        )
          throw new Error("iPad hosting requires the document window");
        if (method === "status") return this.server.status;
        if (this.switching) throw new Error("Wait for the iPad handoff to finish");
        this.switching = true;
        try {
          if (method === "stop") return await this.stop();
          if (!this.server.active) {
            // The renderer must be between tools before transferring ownership.
            await readInspectionView(this.window, false);
            await documents.prepareRemote();
          }
          const result = await this.server.start();
          sessionDialogs.remote = (request) => this.server.request("dialog", request);
          return result;
        } finally {
          this.switching = false;
        }
      });
  }
  attach(window: BrowserWindow): void {
    this.window = window;
    window.once("closed", () => {
      this.window = null;
      void this.stop().catch(console.error);
    });
  }
  private request = async (method: string, value: unknown): Promise<unknown> => {
    switch (method) {
      case "capture-fixture":
        return captureFixture(value);
      case "model":
        return this.documents.model(value);
      case "agent":
        return this.agent.request(value as AgentRequest);
      case "document-status":
        return this.documents.status;
      case "document-command": {
        const request = value as { command: DocumentCommand; camera?: CameraState };
        return this.documents.command(request.command, request.camera);
      }
      case "script-cancel":
        return this.agent.cancelScript();
      case "directory":
        return listComputerDirectory(value);
      default:
        throw new Error("Unknown iPad command");
    }
  };
  async stop(): Promise<void> {
    await this.server.stop();
    sessionDialogs.remote = null;
  }
}
