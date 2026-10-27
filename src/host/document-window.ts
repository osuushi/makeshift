import { join } from "node:path";
import { BrowserWindow, nativeTheme, screen } from "electron";
import { DocumentOwner } from "../backend/document-owner.js";
import { MeshCalculator } from "../backend/mesh-calculator.js";
import { NativeSolver } from "../backend/native-solver.js";
import type { DocumentCommand } from "../model/document-host.js";
import { AgentSession } from "./agent-session.js";
import type { AgentSettings } from "./agent-settings.js";
import type { AgentSetup } from "./agent-setup.js";
import { DocumentIPC } from "./document-ipc.js";
import { DocumentSession } from "./document-session.js";
import { exportDestination } from "./export-destination.js";
import { lockInterfaceZoom } from "./interface-zoom.js";
import { IPadSession } from "./ipad-session.js";
import { nativeExecutable } from "./native-paths.js";
import { openSettingsWindow } from "./settings-window.js";
import { rememberWindowSize, restoreWindowSize } from "./window-size.js";

export interface WindowHost {
  settings: AgentSettings;
  setup: AgentSetup;
  create(command: "new" | "open", window: BrowserWindow): Promise<void>;
  directory: () => string;
  bounds?: Electron.Rectangle;
  name: string;
  startupAnimation: () => boolean;
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
  private opening: Promise<void> = Promise.resolve();
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
      backgroundColor: nativeTheme.shouldUseDarkColors ? "#161e29" : "#f8f9fb",
      webPreferences: {
        preload: join(directory, "preload.cjs"),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: !hidden,
        offscreen: hidden && process.platform === "linux",
      },
    });
    // Preload needs this tiny in-memory decision before the loading script runs.
    // Consume it in the host so reloads and closing every window cannot reset it.
    window.webContents.ipc.on("startup-animation", (event) => {
      const frame = event.senderFrame;
      event.returnValue =
        frame === window.webContents.mainFrame &&
        !!frame.url &&
        frame.url !== "about:blank" &&
        host.startupAnimation();
    });
    this.window = window;
    exportDestination(window, () => this.documents.status.path);
    lockInterfaceZoom(window.webContents);
    rememberWindowSize(window);
    this.documents.attach(window);
    this.agent.attach(window);
    this.ipad.attach(window);
    const ipc = new DocumentIPC();
    ipc.handle("sketch", async (_event, request: unknown) => {
      await this.opening;
      await this.owner.initialize();
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
    ipc.handle("settings-open", (_event, tools: unknown) => openSettingsWindow(directory, tools));
    ipc.attach(window);
    this.installNavigation(window);
    window.webContents.on("did-start-loading", () => this.mesh.close());
    window.webContents.on("render-process-gone", () => this.mesh.close());
    this.closed = new Promise((resolve) =>
      window.once("closed", () => {
        void this.dispose().catch(console.error).finally(resolve);
      }),
    );
  }
  private installNavigation(window: BrowserWindow): void {
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
  }
  async load(path?: string): Promise<void> {
    const opening = path ? this.documents.openPath(path) : Promise.resolve();
    // Keep an existing editor usable if Open fails; only a new window loads in parallel.
    if (this.window.webContents.getURL()) await opening;
    this.opening = opening;
    const url = process.env.MAKESHIFT_DEV_URL;
    const loaded = url
      ? this.window.loadURL(url)
      : this.window.loadFile(join(this.directory, "../renderer/index.html"));
    await Promise.all([loaded, this.opening]);
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
