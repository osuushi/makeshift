import { join } from "node:path";
import { BrowserWindow, screen } from "electron";
import { DocumentOwner } from "../backend/document-owner.js";
import { MeshCalculator } from "../backend/mesh-calculator.js";
import { NativeSolver } from "../backend/native-solver.js";
import type { DocumentCommand } from "../model/document-host.js";
import { AgentSession } from "./agent-session.js";
import type { AgentSettings } from "./agent-settings.js";
import type { AgentSetup } from "./agent-setup.js";
import { DocumentIPC } from "./document-ipc.js";
import { DocumentSession } from "./document-session.js";
import { lockInterfaceZoom } from "./interface-zoom.js";
import { IPadSession } from "./ipad-session.js";
import { nativeExecutable } from "./native-paths.js";
import { rememberWindowSize, restoreWindowSize } from "./window-size.js";

export interface WindowHost {
  settings: AgentSettings;
  setup: AgentSetup;
  create(command: "new" | "open", window: BrowserWindow): Promise<void>;
  directory: () => string;
  bounds?: Electron.Rectangle;
  name: string;
  remember(path?: string | null): Promise<void>;
  write(path: string, action: () => Promise<void>): Promise<void>;
}

/** Everything that can mutate or cancel a document belongs to this window. */
export class DocumentWindow {
  readonly owner = new DocumentOwner(
    new NativeSolver(nativeExecutable("solver")),
    nativeExecutable("kernel"),
  );
  readonly agent: AgentSession;
  readonly documents: DocumentSession;
  readonly window: BrowserWindow;
  private mesh = new MeshCalculator(nativeExecutable("mesh"));
  private ipad: IPadSession;
  private disposed = false;
  readonly closed: Promise<void>;
  constructor(
    private directory: string,
    icon: string,
    host: WindowHost,
  ) {
    this.agent = new AgentSession(host.settings, host.setup);
    this.documents = new DocumentSession(
      this.owner,
      host.create,
      this.agent,
      host.remember,
      host.write,
      host.directory,
      host.name,
    );
    this.ipad = new IPadSession(join(directory, "../renderer"), this.documents, this.agent);
    const hidden = process.env.MAKESHIFT_TEST_HIDDEN === "1";
    const window = new BrowserWindow({
      title: "Makeshift",
      icon,
      ...restoreWindowSize(),
      ...host.bounds,
      show: !hidden,
      backgroundColor: "#f8f9fb",
      webPreferences: {
        preload: join(directory, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: !hidden,
        offscreen: hidden && process.platform === "linux",
      },
    });
    this.window = window;
    lockInterfaceZoom(window.webContents);
    rememberWindowSize(window);
    this.documents.attach(window);
    this.agent.attach(window);
    this.ipad.attach(window);
    const ipc = new DocumentIPC();
    ipc.handle("sketch", (_event, request: unknown) => {
      this.documents.checkDesktop();
      return this.documents.model(request);
    });
    ipc.handle("mesh-export", (_event, input: ArrayBuffer) => {
      this.documents.checkDesktop();
      return this.mesh.calculate(input);
    });
    ipc.handle("mesh-export-cancel", async () => {
      this.documents.checkDesktop();
      await this.mesh.cancel();
    });
    ipc.attach(window);
    window.on("rotate-gesture", (_event, rotation) => {
      if (this.documents.remote?.active() || !Number.isFinite(rotation)) return;
      const cursor = screen.getCursorScreenPoint(),
        content = window.getContentBounds();
      const zoom = window.webContents.getZoomFactor();
      window.webContents.send("navigation-rotate", -rotation, {
        x: (cursor.x - content.x) / zoom,
        y: (cursor.y - content.y) / zoom,
      });
    });
    window.webContents.on("did-start-loading", () => this.mesh.close());
    window.webContents.on("render-process-gone", () => this.mesh.close());
    this.closed = new Promise((resolve) =>
      window.once("closed", () => {
        void this.dispose().catch(console.error).finally(resolve);
      }),
    );
  }
  async load(path?: string): Promise<void> {
    if (path) await this.documents.openPath(path);
    const url = process.env.MAKESHIFT_DEV_URL;
    if (url) await this.window.loadURL(url);
    else await this.window.loadFile(join(this.directory, "../renderer/index.html"));
  }
  dispatch(command: DocumentCommand): void {
    this.documents.dispatch(command);
  }
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.close();
    try {
      await this.ipad.stop();
      await this.agent.stop();
    } finally {
      this.agent.workspace.changed = () => {};
      this.agent.workspace.adopt(null, {});
      this.owner.close();
    }
  }
}
