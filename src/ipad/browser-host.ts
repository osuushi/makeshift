import type { InspectionView } from "../agent/inspection-protocol.js";
import type { AgentReply } from "../agent/protocol.js";
import type { DocumentCommand, DocumentStatus } from "../model/document-host.js";
import type { ModelView } from "../sketch/model-api.js";
import { ConnectionScreen } from "./connection-screen.js";
import { showRemoteDialog } from "./dialogs.js";
import type { DialogRequest } from "./protocol.js";
import { Rpc } from "./rpc.js";

export function connectBrowser(): Promise<void> {
  window.makeshiftRemote = true;
  document.documentElement.classList.add("ipad-mode");
  const token = location.hash.slice(1) || sessionStorage.getItem("freac-pairing") || "";
  sessionStorage.setItem("freac-pairing", token);
  history.replaceState(null, "", location.pathname);
  return new BrowserConnection().connect(token);
}
class BrowserConnection {
  private screen = new ConnectionScreen("Connect to Makeshift", "Reconnect");
  private listeners = new Map<string, Set<(value: never) => void>>();
  private inspect:
    | ((
        render: boolean,
        acquireScript?: boolean,
        selection?: string,
        settings?: string,
      ) => InspectionView | Promise<InspectionView>)
    | null = null;
  private socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/connect`,
  );
  private rpc: Rpc;
  constructor() {
    this.rpc = new Rpc(
      (message) => this.socket.send(message),
      this.handle,
      (method, value) => {
        for (const callback of this.listeners.get(method) ?? []) callback(value as never);
      },
    );
    this.screen.status.textContent = "Connecting…";
    this.screen.action.hidden = true;
    this.screen.action.onclick = () => location.reload();
    this.installAdapters();
  }
  private subscribe<T>(method: string, callback: (value: T) => void): () => void {
    const set = this.listeners.get(method) ?? new Set();
    set.add(callback);
    this.listeners.set(method, set);
    return () => {
      set.delete(callback);
    };
  }
  private installAdapters(): void {
    window.makeshiftFixture = (snapshot) => this.rpc.request("capture-fixture", snapshot);
    window.makeshiftModel = (request) => this.rpc.request("model", request);
    window.makeshiftAgent = {
      request: (request) => this.rpc.request<AgentReply>("agent", request),
    };
    window.makeshiftDocument = {
      command: (command, camera) => this.rpc.request("document-command", { command, camera }),
      commandFinished: (command) => this.rpc.request("document-command-finished", command),
      status: () => this.rpc.request("document-status"),
      onCommand: (callback) => this.subscribe<DocumentCommand>("document-command", callback),
      onStatus: (callback) => this.subscribe<DocumentStatus>("document-status", callback),
    };
    window.makeshiftScript = {
      cancel: () => this.rpc.request("script-cancel"),
      onState: (callback) =>
        this.subscribe<{ running: boolean; view: ModelView }>("agent-script-state", callback),
    };
    window.makeshiftInspection = {
      onRequest: (callback) => {
        this.inspect = callback;
        return () => {
          this.inspect = null;
        };
      },
    };
  }
  private handle = async (method: string, value: unknown): Promise<unknown> => {
    if (method === "dialog") return showRemoteDialog(value as DialogRequest, this.rpc);
    if (method === "inspect") {
      if (!this.inspect) throw new Error("Wait for the iPad editor to finish loading.");
      const request = value as {
        render: boolean;
        acquireScript?: boolean;
        selection?: string;
        settings?: string;
      };
      return this.inspect(
        request.render,
        request.acquireScript,
        request.selection,
        request.settings,
      );
    }
    throw new Error("Unknown host request");
  };
  connect(token: string): Promise<void> {
    let lastMessage = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - lastMessage > 12000) this.socket.close();
    }, 2000);
    window.addEventListener(
      "pagehide",
      () => {
        clearInterval(timer);
        this.socket.close();
      },
      { once: true },
    );
    return new Promise<void>((resolve, reject) => {
      this.socket.onopen = () => this.socket.send(JSON.stringify({ token }));
      this.socket.onmessage = (event) => {
        lastMessage = Date.now();
        try {
          if (JSON.parse(event.data).method === "ready") {
            this.screen.root.hidden = true;
            resolve();
          } else this.rpc.receive(event.data);
        } catch {
          this.socket.close();
        }
      };
      this.socket.onclose = () => {
        clearInterval(timer);
        this.rpc.close();
        for (const dialog of document.querySelectorAll<HTMLDialogElement>("dialog[open]"))
          dialog.close();
        this.screen.root.hidden = false;
        this.screen.status.textContent =
          "Disconnected. Reconnect to read the current document. An interrupted operation is not repeated.";
        this.screen.action.hidden = false;
        for (const element of document.querySelectorAll<HTMLElement>("#app, .agent-dock"))
          element.inert = true;
        reject(new Error("iPad connection closed"));
      };
      this.socket.onerror = () => this.socket.close();
    });
  }
}
