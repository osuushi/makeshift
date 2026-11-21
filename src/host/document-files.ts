import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { app, type BrowserWindow } from "electron";
import type { DocumentOwner } from "../backend/document-owner.js";
import { validateDocument } from "../backend/document-validation.js";
import type { Drawing } from "../model/benches.js";
import { type CameraState, validateCameraState } from "../model/camera-state.js";
import { archivedDrawing, drawingArchive } from "../model/document-archive.js";
import type { DocumentStatus } from "../model/document-host.js";
import {
  type DrawingContents,
  DrawingContentsCache,
  sameDrawingContents,
} from "../model/drawing-contents.js";
import { readPortableArchive, writePortableArchive } from "../model/portable-archive.js";
import { DrawingTrust, usesCustomDecorators } from "../security/drawing-trust.js";
import { portableDigest } from "../security/signatures.js";
import type { AgentWorkspace } from "./agent-workspace.js";
import { safeWrite } from "./safe-write.js";
import { sessionDialogs as dialog } from "./session-dialogs.js";
import { signingDevice } from "./signing-device.js";

export class DocumentFiles {
  private trust: DrawingTrust;
  path: string | null = null;
  get directory(): string {
    return this.path ? dirname(this.path) : this.defaultDirectory();
  }
  private saved: DrawingContents;
  private contents = new DrawingContentsCache();
  camera: CameraState | undefined;
  constructor(
    private owner: DocumentOwner,
    private workspace: AgentWorkspace,
    private remembered: (path: string | null) => Promise<void>,
    private write: (path: string, action: () => Promise<void>, copy?: boolean) => Promise<void>,
    private defaultDirectory: () => string,
    private untitledName: string,
    private window: () => BrowserWindow,
  ) {
    this.trust = new DrawingTrust(signingDevice(window));
    owner.setDecoratorAuthorization((doc) => this.trust.allowDecorators(doc));
    workspace.authorize = async (files) => {
      const digest = await portableDigest(files);
      return digest ? this.trust.authorize("workspace", digest) : "allow";
    };
    workspace.onRecovery = async (files) =>
      this.trust.load("workspace", await portableDigest(files), {});
    this.saved = this.contents.capture(owner.drawing);
  }
  adoptGridDefaults(previous: Drawing): void {
    if (sameDrawingContents(this.saved, this.contents.capture(previous)))
      this.saved = this.contents.capture(this.owner.drawing);
  }
  get status(): DocumentStatus {
    return {
      name: this.path ? basename(this.path) : this.untitledName,
      path: this.path,
      edited:
        !sameDrawingContents(this.contents.capture(this.owner.drawing), this.saved) ||
        this.workspace.dirty,
      camera: this.camera,
    };
  }
  async remember(): Promise<void> {
    await this.remembered(this.path).catch(console.error);
  }
  async prepare(path: string) {
    if ((await stat(path)).size > 72 * 1024 * 1024) throw new Error("Document is too large.");
    const archive = readPortableArchive(await readFile(path));
    const drawing = archivedDrawing(archive);
    for (const { document } of drawing.benches) validateDocument(document);
    const trust = new DrawingTrust(signingDevice(this.window));
    await trust.opened(drawing, archive.files, archive.seals);
    return { path, ...archive, drawing, trust };
  }
  async open(
    path: string,
    prepared?: Awaited<ReturnType<DocumentFiles["prepare"]>>,
  ): Promise<void> {
    const archive = prepared ?? (await this.prepare(path));
    const reply = await this.owner.call({
      kind: "open",
      drawing: archive.drawing,
    });
    if (reply.error) throw new Error(reply.error);
    this.trust = archive.trust;
    this.workspace.stage(archive.files);
    if (usesCustomDecorators(this.owner.drawing))
      await this.owner.call({ kind: "restore-decorators" });
    this.path = path;
    app.addRecentDocument(path);
    this.camera = archive.camera;
    this.saved = this.contents.capture(this.owner.drawing);
    await this.remember();
  }
  async save(
    window: BrowserWindow,
    saveAs = false,
    beforeCapture?: () => Promise<void>,
    camera?: CameraState,
    copy = false,
  ): Promise<boolean> {
    let path = this.path;
    if (copy && usesCustomDecorators(this.owner.drawing)) {
      const choice = await dialog.showMessageBox(window, {
        type: "warning",
        message: "This copy uses custom decorators",
        detail:
          "The agent workspace and conversations will be removed. Recipients may be asked to trust the decorators before using them.",
        buttons: ["Export copy", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });
      if (choice.response !== 0) return false;
    }
    if (!path || saveAs || copy) {
      const result = await dialog.showSaveDialog(window, {
        title: copy ? "Export without agent workspace" : "Save Document",
        defaultPath: copy
          ? join(
              this.directory,
              (path ? basename(path).replace(/\.(freac|makeshift)$/i, "") : this.untitledName) +
                " - shared.makeshift",
            )
          : (path ?? join(this.directory, `${this.untitledName}.makeshift`)),
        filters: [{ name: "Makeshift Document", extensions: ["makeshift"] }],
      });
      if (result.canceled || !result.filePath) return false;
      path = result.filePath;
    }
    await beforeCapture?.();
    const drawing = this.owner.drawing;
    const model = this.contents.capture(drawing);
    const archive = drawingArchive(drawing, validateCameraState(camera) ?? this.camera);
    const files = copy ? {} : await this.workspace.snapshot();
    const publication = await this.trust.prepareSave(drawing, files);
    const bytes = writePortableArchive(archive, files, publication.seals);
    await this.write(
      path,
      async () => {
        await safeWrite(path, bytes);
        if (!copy) this.path = path;
      },
      copy,
    );
    if (copy) return true;
    await publication.saved();
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
  async leave(
    window: BrowserWindow,
    stop: () => Promise<void>,
    camera?: CameraState,
  ): Promise<boolean> {
    // Include final agent writes in the ordinary unsaved-work choice.
    await stop();
    const choice = await this.replacementChoice(window);
    return (
      choice === "clean" ||
      choice === "discard" ||
      (choice === "save" && (await this.save(window, false, undefined, camera)))
    );
  }
}
