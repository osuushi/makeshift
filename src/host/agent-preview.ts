import { randomUUID } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserWindow, ipcMain, WebContentsView } from "electron";
import type { PreviewLayout, PreviewRequest } from "../agent/preview-protocol.js";
import { DocumentIPC } from "./document-ipc.js";
import { previewPath, readPreviewData, writePreviewData } from "./preview-files.js";
import { previewSession } from "./preview-session.js";
import { safeWrite } from "./safe-write.js";

const owners = new Map<number, PreviewView>();
ipcMain.handle("preview-data", (event, action, value) => {
  const owner = owners.get(event.sender.id);
  if (!owner || event.senderFrame !== event.sender.mainFrame) throw new Error("Preview is closed.");
  return owner.data(action, value);
});

const layoutFile = ".makeshift-pane.json";

/** Dispatch by portable directory. Commands without a directory target the latest preview. */
export class AgentPreview {
  private views = new Map<string, PreviewView>();
  private ipc = new DocumentIPC();
  private generation = 0;
  private ready = false;
  private writes: Promise<unknown> = Promise.resolve();
  async settled() {
    await this.writes;
  }
  private queue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = this.writes.then(operation);
    this.writes = result.catch(() => {});
    return result;
  };
  private archived: { directory: string; title: string }[] = [];
  restore(files: Record<string, Uint8Array>) {
    this.close();
    for (const [path, bytes] of Object.entries(files)) {
      if (!path.startsWith("workspace/") || !path.endsWith(`/${layoutFile}`) || bytes.length > 8192)
        continue;
      try {
        const record = JSON.parse(new TextDecoder().decode(bytes));
        if (record.open === true && typeof record.title === "string")
          this.archived.push({
            directory: path.slice("workspace/".length, -layoutFile.length - 1) || ".",
            title: record.title,
          });
      } catch {
        /* A damaged view preference cannot prevent opening geometry. */
      }
    }
    return this.restoreReady();
  }
  private async restoreReady() {
    if (!this.ready) return;
    const generation = this.generation;
    for (const item of this.archived.splice(0)) {
      if (generation !== this.generation) return;
      await this.request(JSON.stringify({ action: "open", ...item }), "").catch(console.error);
    }
  }
  constructor(
    private window: BrowserWindow,
    private workspace: () => string | null,
  ) {
    this.ipc.handle("preview-layout", (_event, id: string, layout: PreviewLayout | null) => {
      const view = this.views.get(id);
      if (!view) return;
      if (layout) return view.layout(layout);
      else {
        return this.dismiss(id);
      }
    });
    this.ipc.handle("preview-placement", (_event, id: string, state: unknown) =>
      this.views.get(id)?.save(state),
    );
    this.ipc.handle("preview-ready", () => {
      this.ready = true;
      for (const [id, view] of this.views) if (view.loaded) this.announce(id, view);
      return this.restoreReady();
    });
    window.webContents.on("did-start-loading", () => {
      this.ready = false;
    });
    this.ipc.attach(window);
    window.once("closed", () => this.close());
  }
  private announce(id: string, view: PreviewView) {
    this.window.webContents.send("preview-open", { id, title: view.title, saved: view.state });
  }
  private dismiss(id: string) {
    const view = this.views.get(id);
    if (!view) return;
    const saved = view.save(view.state, false);
    this.remove(id);
    return saved;
  }
  private remove(id: string) {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    view.close();
    if (!this.window.isDestroyed())
      this.window.webContents.send("preview-open", { id, title: null });
  }
  async request(input: string | undefined, output: string) {
    const request = JSON.parse(input ?? "{}") as PreviewRequest;
    const generation = this.generation;
    const cwd = this.workspace();
    const directory = request.directory;
    const workspace = cwd && directory !== undefined ? await realpath(cwd) : null;
    const root =
      workspace && directory !== undefined ? await previewPath(workspace, directory) : null;
    const id =
      root && workspace ? relative(workspace, root) || "." : Array.from(this.views.keys()).at(-1);
    if (generation !== this.generation) throw new Error("Document changed.");
    if (request.action === "open") {
      if (!root || !id) throw new Error("Expected a workspace directory.");
      await previewPath(root, "index.html");
      if (generation !== this.generation) throw new Error("Document changed.");
      this.remove(id);
      const view = new PreviewView(this.window, root, request.title ?? "Preview", this.queue);
      this.views.set(id, view);
      try {
        await view.load();
        if (this.views.get(id) !== view) throw new Error("Preview closed.");
        if (!view.restored) await view.save(view.state);
        if (this.views.get(id) === view && this.ready) this.announce(id, view);
        return { directory: root, data: join(root, "data.json"), width: 640, height: 480 };
      } catch (error) {
        if (this.views.get(id) === view) this.remove(id);
        throw error;
      }
    }
    if (request.action === "close") {
      if (id) await this.dismiss(id);
      return { closed: true };
    }
    const view = id && this.views.get(id);
    if (!view) throw new Error("Open a preview first.");
    return view.request(request, output);
  }
  close() {
    this.archived = [];
    this.generation++;
    for (const id of this.views.keys()) this.remove(id);
  }
}

class PreviewView {
  private view: WebContentsView;
  private covered = false;
  restored = false;
  loaded = false;
  state: unknown;
  constructor(
    private window: BrowserWindow,
    private root: string,
    readonly title: string,
    private queue: <T>(op: () => Promise<T>) => Promise<T>,
  ) {
    const view = new WebContentsView({
      webPreferences: {
        session: previewSession(root),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        preload: join(dirname(fileURLToPath(import.meta.url)), "../preview-preload.cjs"),
      },
    });
    this.view = view;
    owners.set(view.webContents.id, this);
    view.webContents.setIgnoreMenuShortcuts(true);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    this.window.contentView.addChildView(view);
    view.setBounds({ x: 24, y: 80, width: 640, height: 480 });
    view.setVisible(false);
  }
  async load() {
    await this.view.webContents.loadURL("https://preview.local/index.html");
    try {
      const record = await this.queue(async () =>
        JSON.parse(await readFile(await previewPath(this.root, layoutFile), "utf8")),
      );
      this.state = record.placement;
      this.restored = record.open === true && record.title === this.title;
    } catch {
      /* New preview. */
    }
    this.loaded = true;
  }
  save(state: unknown, open = true) {
    this.state = state;
    return this.queue(() =>
      safeWrite(
        join(this.root, layoutFile),
        JSON.stringify({ placement: state, open, title: this.title }),
        0o600,
      ),
    );
  }
  async layout(layout: PreviewLayout) {
    if (![layout.x, layout.y, layout.width, layout.height].every(Number.isFinite)) return;
    if (!layout.collapsed)
      this.view.setBounds({
        x: Math.round(layout.x),
        y: Math.round(layout.y),
        width: Math.max(1, Math.round(layout.width)),
        height: Math.max(1, Math.round(layout.height)),
      });
    const capture = layout.covered && !this.covered;
    this.covered = layout.covered === true;
    this.view.setVisible(!layout.collapsed && !layout.covered);
    if (capture) {
      const image = await this.view.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: true,
      });
      return image.toDataURL();
    }
  }
  async data(action: string, value?: unknown): Promise<unknown> {
    const root = this.root;
    return this.queue(async () => {
      if (action === "read") return readPreviewData(root);
      if (action !== "write") throw new Error("Unknown preview data action.");
      await writePreviewData(root, value);
      return { saved: true };
    });
  }
  async request(request: PreviewRequest, output: string) {
    const view = this.view;
    switch (request.action) {
      case "read":
        return { data: await this.data("read") };
      case "reload":
        await view.webContents.loadURL("https://preview.local/index.html");
        break;
      case "trigger":
        view.webContents.send("preview-trigger", request.name ?? "data", request.detail);
        break;
      case "eval":
        if (typeof request.code !== "string") throw new Error("Expected JavaScript code.");
        return { result: await view.webContents.executeJavaScript(request.code) };
      case "screenshot": {
        const image = await view.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        if (image.isEmpty()) throw new Error("Preview has not rendered yet; retry after loading.");
        const path = join(output, `preview-${randomUUID()}.png`);
        await writeFile(path, image.toPNG(), { mode: 0o600, flag: "wx" });
        return { path, ...image.getSize() };
      }
      default:
        throw new Error("Unknown preview action.");
    }
    return { ok: true };
  }
  close(): void {
    owners.delete(this.view.webContents.id);
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view);
    this.view.webContents.session.protocol.unhandle("https");
    this.view.webContents.close();
  }
}
