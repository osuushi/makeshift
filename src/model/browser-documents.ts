import {
  adoptBrowserTrust,
  browserAsk,
  browserTrust,
  newBrowserTrust,
} from "../security/browser-device.js";
import { usesCustomDecorators } from "../security/drawing-trust.js";
import { portableDigest } from "../security/signatures.js";
import type { SketchEditor } from "../sketch/editor.js";
import { BrowserArchive, downloadArchive } from "./browser-archive.js";
import { confirmReplacement, pickSaveFile, writeBrowserFile } from "./browser-file-access.js";
import { browserLibrary } from "./browser-library.js";
import { chooseDrawing, drawingName } from "./browser-library-dialog.js";
import { restoreCamera } from "./camera-state.js";
import { archivedDrawing, drawingArchive } from "./document-archive.js";
import { type DrawingContents, sameDrawingContents, VisitedBenches } from "./drawing-contents.js";
import type { PortableFiles } from "./portable-files.js";
import { type WorkspaceCommand, workspaceCommand } from "./workspace-files.js";

const maxDrawingBytes = 72 * 1024 * 1024;

/** Browser file identity and portable bytes remain outside geometry and Undo. */
export class BrowserDocuments {
  private files: PortableFiles = {};
  private savedFiles = this.files;
  private workspaceReady = true;
  async workspace(command: WorkspaceCommand): Promise<unknown> {
    if (this.blocked() || document.querySelector("dialog[open]"))
      throw new Error("Finish the current operation first.");
    if (!this.workspaceReady) {
      this.active = true;
      try {
        const digest = await portableDigest(this.files);
        const choice = digest ? await browserTrust.authorize("workspace", digest) : "allow";
        if (choice === "deny") throw new Error("Workspace access was declined.");
        if (choice === "empty") {
          // The existing prompt explicitly discards the included agent files and conversations.
          await browserTrust.load("workspace", undefined, {});
          this.files = {};
        }
        this.workspaceReady = true;
      } finally {
        this.active = false;
      }
    }
    const { files, result } = workspaceCommand(this.files, command);
    if (
      files !== this.files &&
      Object.values(files).reduce((sum, file) => sum + file.length, 0) > maxDrawingBytes
    )
      throw new Error("Workspace exceeds the browser drawing size limit (72 MiB).");
    this.files = files;
    return result;
  }
  private filename = "Untitled.makeshift";
  private drawingId: string | undefined;
  private codec = new BrowserArchive();
  private baseline: DrawingContents;
  private benches = new VisitedBenches();
  private active = false;
  get name(): string {
    return this.filename;
  }
  constructor(private editor: SketchEditor) {
    this.baseline = this.contents();
    editor.world.changed.add(this.observeBench);
    window.addEventListener("beforeunload", this.beforeUnload);
    if (editor.store.busy) editor.world.changed.add(this.initialBaseline);
  }
  private initialBaseline = (): void => {
    if (this.editor.store.busy) return;
    this.baseline = this.contents();
    this.editor.world.changed.delete(this.initialBaseline);
  };
  private observeBench = (): void => {
    const { editingBench, acceptedData } = this.editor.store;
    this.benches.observe(editingBench, acceptedData);
  };
  private contents(): DrawingContents {
    this.observeBench();
    return this.benches.contents(this.editor.store.benchTabs);
  }
  private dirty(): boolean {
    return this.files !== this.savedFiles || !sameDrawingContents(this.contents(), this.baseline);
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.dirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  blocked(): boolean {
    return this.active || this.editor.blocked || !!this.editor.interactions.current;
  }
  private canReplace(): Promise<boolean> {
    return this.dirty() ? confirmReplacement(() => this.save()) : Promise.resolve(true);
  }
  async save(saveAs = false, download = false, clean = false): Promise<boolean> {
    if (this.blocked()) return false;
    this.active = true;
    const editor = this.editor;
    editor.store.busy = true;
    editor.refresh();
    try {
      const drawing = await editor.store.readDrawing();
      if (
        clean &&
        usesCustomDecorators(drawing) &&
        (await browserAsk({
          message: "This copy uses custom decorators",
          detail:
            "Recipients may be asked to trust them. The copy excludes agent files and conversations.",
          buttons: ["Cancel", "Export copy"],
        })) !== 1
      )
        return false;
      const name =
        saveAs || download || !this.drawingId
          ? await drawingName(
              clean
                ? this.filename.replace(/\.makeshift$/i, "") + " - shared.makeshift"
                : this.filename,
            )
          : this.filename;
      if (!name) return false;
      const destination = download ? await pickSaveFile(name) : undefined;
      const files = clean ? {} : this.files;
      const publication = await browserTrust.prepareSave(drawing, files);
      const data = await this.codec.run(
        {
          kind: "write",
          model: drawingArchive(drawing, editor.benchViews.fileCamera()),
          files,
          seals: publication.seals,
        },
        editor,
      );
      editor.store.busy = true;
      if (!(data instanceof Uint8Array)) throw new Error("Invalid archive result.");
      if (data.length > maxDrawingBytes)
        throw new Error("Document exceeds the browser drawing size limit (72 MiB).");
      if (download) {
        if (destination) await writeBrowserFile(destination, data);
        else downloadArchive(data, name);
        editor.notice = `Downloaded ${name}`;
      } else {
        const id = !saveAs && this.drawingId ? this.drawingId : crypto.randomUUID();
        await browserLibrary.save({ id, name, bytes: data, modified: Date.now() });
        this.drawingId = id;
        this.filename = name;
        this.savedFiles = files;
        this.benches.reset(drawing);
        this.baseline = this.contents();
        await publication.saved();
        editor.notice = `Saved ${name} in this browser`;
      }
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        editor.message = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      this.active = false;
      editor.store.busy = false;
      editor.refresh();
    }
  }
  async newDocument(): Promise<void> {
    if (this.blocked() || !(await this.canReplace()) || this.blocked()) return;
    this.active = true;
    try {
      const editor = this.editor;
      if (!(await editor.newDocument())) return;
      this.benches.reset();
      this.savedFiles = this.files = {};
      this.workspaceReady = true;
      await browserTrust.opened(editor.store.data, {});
      this.filename = "Untitled.makeshift";
      this.drawingId = undefined;
      this.baseline = this.contents();
      this.editor.world.exit();
      restoreCamera(this.editor.world, undefined);
    } finally {
      this.active = false;
    }
  }
  async browse(importFile: () => void): Promise<void> {
    if (this.blocked()) return;
    this.active = true;
    let entry: Awaited<ReturnType<typeof chooseDrawing>>;
    try {
      entry = await chooseDrawing();
    } finally {
      this.active = false;
    }
    if (entry === "import") importFile();
    else if (entry) await this.open(new File([new Uint8Array(entry.bytes)], entry.name), entry.id);
  }
  async open(file: File, drawingId?: string): Promise<void> {
    if (this.blocked() || !(await this.canReplace()) || this.blocked()) return;
    this.active = true;
    const editor = this.editor;
    editor.store.busy = true;
    editor.message = "Opening document…";
    editor.refresh();
    try {
      if (file.size > maxDrawingBytes) throw new Error("Document is too large.");
      const archive = await this.codec.run(
        { kind: "read", bytes: new Uint8Array(await file.arrayBuffer()) },
        editor,
      );
      if (archive instanceof Uint8Array) throw new Error("Invalid archive result.");
      const drawing = archivedDrawing(archive);
      const trust = newBrowserTrust();
      await trust.opened(drawing, archive.files, archive.seals);
      if (!(await editor.store.request({ kind: "open", drawing }))) return;
      adoptBrowserTrust(trust);
      if (usesCustomDecorators(drawing)) await editor.store.request({ kind: "restore-decorators" });
      editor.store.busy = true;
      this.benches.reset(await editor.store.readDrawing());
      this.savedFiles = this.files = archive.files;
      this.workspaceReady = Object.keys(archive.files).length === 0;
      this.filename = file.name.replace(/\.freac$/i, ".makeshift");
      this.drawingId = drawingId;
      this.baseline = this.contents();
      editor.bodiesVisible = true;
      editor.visibility.reset();
      editor.world.crossSection = null;
      editor.modeling.targets = [];
      editor.world.exit();
      restoreCamera(editor.world, archive.camera);
    } catch (error) {
      editor.message = error instanceof Error ? error.message : String(error);
    } finally {
      this.active = false;
      editor.store.busy = false;
      editor.refresh();
    }
  }
  dispose(): void {
    window.removeEventListener("beforeunload", this.beforeUnload);
    this.editor.world.changed.delete(this.observeBench);
    this.editor.world.changed.delete(this.initialBaseline);
    this.codec.dispose();
  }
}
