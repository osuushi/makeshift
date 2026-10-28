import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserWindow, ipcMain, WebContentsView } from "electron";
import type { PreviewLayout, PreviewRequest } from "../agent/preview-protocol.js";
import { DocumentIPC } from "./document-ipc.js";
import { previewPath, readPreviewData, writePreviewData } from "./preview-files.js";
import { previewSession } from "./preview-session.js";

const owners = new Map<number, AgentPreview>();
ipcMain.handle("preview-data", (event, action, value) => {
  const owner = owners.get(event.sender.id);
  if (!owner || event.senderFrame !== event.sender.mainFrame) throw new Error("Preview is closed.");
  return owner.data(action, value);
});

/** One isolated preview per document, without the CAD preload. */
export class AgentPreview {
  private view: WebContentsView | null = null;
  private root: string | null = null;
  private ipc = new DocumentIPC();
  private writes: Promise<unknown> = Promise.resolve();
  constructor(
    private window: BrowserWindow,
    private workspace: () => string | null,
  ) {
    this.ipc.handle("preview-layout", (_event, layout: PreviewLayout | null) => {
      if (!layout) return this.close();
      if (!this.view) return;
      if (![layout.x, layout.y, layout.width, layout.height].every(Number.isFinite)) return;
      const width = Math.max(200, Math.min(2048, Math.round(layout.width)));
      const height = Math.max(100, Math.min(2048, Math.round(layout.height)));
      this.view.setBounds({ x: Math.round(layout.x), y: Math.round(layout.y), width, height });
      this.view.setVisible(!layout.collapsed);
    });
    this.ipc.attach(window);
    window.once("closed", () => this.close());
  }
  async data(action: string, value?: unknown): Promise<unknown> {
    const root = this.root;
    if (!root) throw new Error("Preview is closed.");
    const work = this.writes.then(async () => {
      if (action === "read") return readPreviewData(root);
      if (action !== "write") throw new Error("Unknown preview data action.");
      await writePreviewData(root, value);
      return { saved: true };
    });
    this.writes = work.catch(() => {});
    return work;
  }
  async request(input: string | undefined, output: string): Promise<unknown> {
    const request = JSON.parse(input ?? "{}") as PreviewRequest;
    if (request.action === "open") return this.open(request);
    if (request.action === "close") {
      this.close();
      return { closed: true };
    }
    const view = this.view;
    if (!view) throw new Error("Open a preview first.");
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
  private async open(request: PreviewRequest): Promise<unknown> {
    const workspace = this.workspace();
    if (!workspace || typeof request.directory !== "string")
      throw new Error("Expected a workspace directory.");
    const root = await previewPath(workspace, request.directory);
    await previewPath(root, "index.html");
    this.close();
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
    this.root = root;
    this.view = view;
    owners.set(view.webContents.id, this);
    view.webContents.setIgnoreMenuShortcuts(true);
    view.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    view.webContents.on("will-navigate", (event) => event.preventDefault());
    this.window.contentView.addChildView(view);
    view.setBounds({ x: 24, y: 80, width: 640, height: 480 });
    try {
      await view.webContents.loadURL("https://preview.local/index.html");
    } catch (error) {
      this.close();
      throw error;
    }
    this.window.webContents.send("preview-open", request.title ?? "Preview");
    return { directory: root, data: join(root, "data.json"), width: 640, height: 480 };
  }
  close(): void {
    if (!this.view) return;
    owners.delete(this.view.webContents.id);
    if (!this.window.isDestroyed()) this.window.contentView.removeChildView(this.view);
    this.view.webContents.session.protocol.unhandle("https");
    this.view.webContents.close();
    this.view = null;
    this.root = null;
    if (!this.window.isDestroyed()) this.window.webContents.send("preview-open", null);
  }
}
