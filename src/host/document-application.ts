import { realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import type { DocumentCommand } from "../model/document-host.js";
import { AgentSettings } from "./agent-settings.js";
import { AgentSetup } from "./agent-setup.js";
import { installDocumentMenu } from "./document-menu.js";
import { DocumentWindow } from "./document-window.js";
import { DocumentWindows, type SavedDocumentWindow, windowBounds } from "./document-windows.js";
import { sessionDialogs } from "./session-dialogs.js";

async function canonical(path: string): Promise<string> {
  const absolute = resolve(path);
  return realpath(absolute).catch(async () =>
    join(await realpath(dirname(absolute)).catch(() => dirname(absolute)), basename(absolute)),
  );
}

/** Application menus, open-file deduplication and coordinated shutdown. */
export class DocumentApplication {
  private settings = new AgentSettings(app.getPath("userData"));
  private setup = new AgentSetup(this.settings, app);
  private documents = new Set<DocumentWindow>();
  private identities = new Map<DocumentWindow, string>();
  private pending = new Map<string, Promise<void>>();
  private writes = new Set<string>();
  private preferences = new DocumentWindows();
  private shuttingDown = false;
  private quitting = false;
  private restoring = false;
  private startup: Promise<void> = Promise.resolve();
  private untitled = 0;
  private lastFocused: DocumentWindow | undefined;
  updates?: { check(): void; install(): void };
  constructor(
    private directory: string,
    private icon: string,
  ) {
    installDocumentMenu(
      (command) => this.dispatch(command),
      () => this.updates?.check(),
    );
    app.on("before-quit", (event) => {
      if (this.quitting) return;
      event.preventDefault();
      void this.quit();
    });
    app.on("activate", () => {
      if (!this.documents.size) void this.open().catch((error) => this.error(error));
      else this.focus(this.active());
    });
  }
  private active(): DocumentWindow | undefined {
    const focused = BrowserWindow.getFocusedWindow();
    return [...this.documents].find((entry) => entry.window === focused) ?? this.lastFocused;
  }
  private focus(document?: DocumentWindow): void {
    if (!document || document.window.isDestroyed()) return;
    if (document.window.isMinimized()) document.window.restore();
    if (process.env.MAKESHIFT_TEST_HIDDEN !== "1") {
      document.window.show();
      document.window.focus();
    }
    this.lastFocused = document;
  }
  dispatch(command: DocumentCommand): void {
    if (this.shuttingDown) return;
    if (command === "quit" || command === "restart-update")
      void this.quit(command === "restart-update");
    else if (command === "new") void this.open().catch((error) => this.error(error));
    else if (command === "open")
      void this.choose(this.active()?.window).catch((error) => this.error(error));
    else this.active()?.dispatch(command);
  }
  private async choose(window?: BrowserWindow): Promise<void> {
    const currentPath = [...this.documents].find((entry) => entry.window === window)?.documents
      .status.path;
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      defaultPath: currentPath ? dirname(currentPath) : this.preferences.directory,
      filters: [{ name: "Makeshift Document", extensions: ["makeshift", "freac"] }],
    };
    const result = window
      ? await sessionDialogs.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (!result.canceled) for (const path of result.filePaths) await this.open(path);
  }
  async open(path?: string, bounds?: Electron.Rectangle): Promise<void> {
    if (this.shuttingDown) return;
    const identity = path ? await canonical(path) : undefined;
    if (identity) {
      if (this.writes.has(identity))
        throw new Error(
          "This document is being saved. Try opening it again after the save completes.",
        );
      await this.refreshIdentities();
      if (this.shuttingDown) return;
      if (this.writes.has(identity))
        throw new Error(
          "This document is being saved. Try opening it again after the save completes.",
        );
      const existing = [...this.identities].find(([, value]) => value === identity)?.[0];
      if (existing) {
        this.focus(existing);
        return;
      }
      const pending = this.pending.get(identity);
      if (pending) return pending;
    }
    const opening = this.create(path, identity, bounds);
    if (identity) this.pending.set(identity, opening);
    try {
      await opening;
    } finally {
      if (identity) this.pending.delete(identity);
    }
  }
  private async create(
    path?: string,
    identity?: string,
    bounds?: Electron.Rectangle,
  ): Promise<void> {
    let document: DocumentWindow;
    const number = path ? 0 : ++this.untitled;
    document = new DocumentWindow(this.directory, this.icon, {
      name: number > 1 ? `Untitled ${number}` : "Untitled",
      settings: this.settings,
      setup: this.setup,
      create: async (command, window) => {
        if (command === "new") await this.open();
        else await this.choose(window);
      },
      directory: () => this.preferences.directory,
      bounds: bounds ?? this.cascade(),
      remember: (path) => {
        if (path) this.preferences.directory = dirname(path);
        return this.remember();
      },
      write: (path, action) => this.write(document, path, action),
    });
    this.documents.add(document);
    if (identity) this.identities.set(document, identity);
    document.window.on("focus", () => {
      this.lastFocused = document;
    });
    document.window.once("closed", () => {
      this.documents.delete(document);
      this.identities.delete(document);
      if (this.lastFocused === document) this.lastFocused = [...this.documents].at(-1);
      if (!this.shuttingDown) void this.remember();
    });
    try {
      await document.load(path);
      this.focus(document);
      await this.remember();
    } catch (error) {
      document.window.destroy();
      await document.closed;
      throw error;
    }
  }
  private async refreshIdentities(): Promise<void> {
    for (const document of this.documents) {
      const path = document.documents.status.path;
      if (path) {
        const identity = await canonical(path);
        if (this.documents.has(document)) this.identities.set(document, identity);
      }
    }
  }
  private async write(
    document: DocumentWindow,
    path: string,
    action: () => Promise<void>,
  ): Promise<void> {
    const identity = await canonical(path);
    await this.refreshIdentities();
    if (
      this.writes.has(identity) ||
      this.pending.has(identity) ||
      [...this.identities].some(([other, value]) => other !== document && value === identity)
    )
      throw new Error(
        "This file is already open or being saved in another window. Choose another filename.",
      );
    this.writes.add(identity);
    try {
      await action();
      this.identities.set(document, identity);
    } finally {
      this.writes.delete(identity);
    }
  }
  private cascade(): Electron.Rectangle | undefined {
    const current = this.active()?.window;
    if (!current || current.isDestroyed()) return;
    const bounds = current.getNormalBounds();
    return windowBounds({ ...bounds, x: bounds.x + 24, y: bounds.y + 24 });
  }
  private snapshot(): SavedDocumentWindow[] {
    return [...this.documents].map((entry) => ({
      path: entry.documents.status.path,
      bounds:
        entry.window.isFullScreen() || entry.window.isMinimized()
          ? entry.window.getNormalBounds()
          : entry.window.getBounds(),
    }));
  }
  remember(): Promise<void> {
    if (this.restoring || this.shuttingDown) return this.preferences.flushed;
    return this.preferences.write(this.snapshot());
  }
  restore(openFiles: string[]): Promise<void> {
    this.startup = this.restoreWindows(openFiles);
    return this.startup;
  }
  private async restoreWindows(openFiles: string[]): Promise<void> {
    const windows = await this.preferences.read();
    this.restoring = true;
    try {
      for (const window of openFiles.length
        ? openFiles.map((path) => ({ path, bounds: undefined }))
        : windows) {
        try {
          await this.open(window.path ?? undefined, window.bounds);
        } catch (error) {
          await this.error(error);
        }
      }
      if (!this.documents.size) await this.open();
    } finally {
      this.restoring = false;
    }
    await this.remember();
  }
  async quit(update = false): Promise<void> {
    await this.startup;
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    const documents = [...this.documents];
    try {
      for (const document of documents) {
        this.focus(document);
        if (!(await document.documents.prepareToQuit())) return;
      }
      // Remember the whole set before closing; a canceled Quit never removes a window.
      await this.preferences.write(this.snapshot());
      if (update) {
        for (const document of documents) document.documents.allowUpdateClose();
        this.quitting = true;
        this.updates?.install();
      } else {
        for (const document of documents) document.documents.closePrepared();
        await Promise.all(documents.map((document) => document.closed));
        this.quitting = true;
        app.quit();
      }
    } catch (error) {
      this.quitting = false;
      await this.error(error);
    } finally {
      if (!this.quitting) {
        this.shuttingDown = false;
        for (const document of documents) document.documents.resumeAfterQuit();
      }
    }
  }
  updateInstallFailed(): void {
    this.quitting = false;
    this.shuttingDown = false;
    for (const document of this.documents) document.documents.resumeAfterQuit();
  }
  checkDesktop(sender: Electron.WebContents): void {
    const document = [...this.documents].find((entry) => entry.window.webContents === sender);
    if (!document) throw new Error("Requires a document window");
    document.documents.checkDesktop();
  }
  async error(error: unknown): Promise<void> {
    console.error(error);
    await dialog.showMessageBox({
      type: "error",
      message: "Could not complete document operation",
      detail: String(error),
      buttons: ["OK"],
    });
  }
}
