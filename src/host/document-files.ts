import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { app, type BrowserWindow } from "electron";
import type { DocumentOwner } from "../backend/document-owner.js";
import { validateDocument } from "../backend/document-validation.js";
import { type CameraState, validateCameraState } from "../model/camera-state.js";
import { documentArchive } from "../model/document-archive.js";
import type { DocumentStatus } from "../model/document-host.js";
import { readPortableArchive, writePortableArchive } from "../model/portable-archive.js";
import type { AgentWorkspace } from "./agent-workspace.js";
import { safeWrite } from "./safe-write.js";
import { sessionDialogs as dialog } from "./session-dialogs.js";

export class DocumentFiles {
  path: string | null = null;
  get directory(): string {
    return this.path ? dirname(this.path) : this.defaultDirectory();
  }
  private saved: string;
  camera: CameraState | undefined;
  private cachedDocument: DocumentOwner["view"]["data"];
  private cachedArchive: string;
  constructor(
    private owner: DocumentOwner,
    private workspace: AgentWorkspace,
    private remembered: (path: string | null) => Promise<void>,
    private write: (path: string, action: () => Promise<void>) => Promise<void>,
    private defaultDirectory: () => string,
    private untitledName: string,
  ) {
    this.cachedDocument = owner.view.data;
    this.saved = this.cachedArchive = documentArchive(this.cachedDocument);
  }
  private get archive(): string {
    if (this.cachedDocument !== this.owner.view.data) {
      this.cachedDocument = this.owner.view.data;
      this.cachedArchive = documentArchive(this.cachedDocument);
    }
    return this.cachedArchive;
  }
  get status(): DocumentStatus {
    return {
      name: this.path ? basename(this.path) : this.untitledName,
      path: this.path,
      edited: this.archive !== this.saved || this.workspace.dirty,
      camera: this.camera,
    };
  }
  async remember(): Promise<void> {
    await this.remembered(this.path).catch(console.error);
  }
  async prepare(path: string) {
    if ((await stat(path)).size > 72 * 1024 * 1024) throw new Error("Document is too large.");
    const archive = readPortableArchive(await readFile(path));
    validateDocument(archive.document);
    const root = Object.keys(archive.files).length
      ? await this.workspace.prepare(archive.files)
      : null;
    return { path, ...archive, root };
  }
  async open(
    path: string,
    prepared?: Awaited<ReturnType<DocumentFiles["prepare"]>>,
  ): Promise<void> {
    const archive = prepared ?? (await this.prepare(path));
    const reply = await this.owner.call({
      kind: "open",
      document: archive.document,
    });
    if (reply.error) throw new Error(reply.error);
    this.workspace.adopt(archive.root, archive.files);
    this.path = path;
    app.addRecentDocument(path);
    this.camera = archive.camera;
    this.saved = this.archive;
    await this.remember();
  }
  async save(
    window: BrowserWindow,
    saveAs = false,
    beforeCapture?: () => Promise<void>,
    camera?: CameraState,
  ): Promise<boolean> {
    let path = this.path;
    if (!path || saveAs) {
      const result = await dialog.showSaveDialog(window, {
        title: "Save Document",
        defaultPath: path ?? join(this.directory, `${this.untitledName}.makeshift`),
        filters: [{ name: "Makeshift Document", extensions: ["makeshift"] }],
      });
      if (result.canceled || !result.filePath) return false;
      path = result.filePath;
    }
    await beforeCapture?.();
    const model = this.archive;
    const archive = documentArchive(
      this.owner.view.data,
      validateCameraState(camera) ?? this.camera,
    );
    const files = await this.workspace.snapshot();
    const bytes = writePortableArchive(archive, files);
    await this.write(path, async () => {
      await safeWrite(path, bytes);
      this.path = path;
    });
    this.saved = model;
    this.camera = camera ?? this.camera;
    this.workspace.saved(files);
    app.addRecentDocument(path);
    await this.remember();
    return true;
  }
  async replacementChoice(window: BrowserWindow): Promise<"clean" | "save" | "discard" | "cancel"> {
    await this.workspace.refresh();
    if (!this.status.edited) return "clean";
    const { response } = await dialog.showMessageBox(window, {
      type: "warning",
      message: `Do you want to save the changes made to “${this.status.name}”?`,
      detail: "Your changes will be lost if you don’t save them.",
      buttons: ["Save", "Cancel", "Don’t Save"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    return response === 2 ? "discard" : response === 0 ? "save" : "cancel";
  }
}
