import type { SketchEditor } from "../sketch/editor.js";
import { BrowserArchive, downloadArchive } from "./browser-archive.js";
import {
  type BrowserFileHandle,
  confirmReplacement,
  pickSaveFile,
  writeBrowserFile,
} from "./browser-file-access.js";
import { captureCamera, restoreCamera } from "./camera-state.js";
import { documentArchive } from "./document-archive.js";
import type { PortableFiles } from "./portable-files.js";

/** Browser file identity and portable bytes remain outside geometry and Undo. */
export class BrowserDocuments {
  private files: PortableFiles = {};
  private filename = "Untitled.makeshift";
  private handle: BrowserFileHandle | undefined;
  private codec = new BrowserArchive();
  private baseline: string;
  private active = false;
  constructor(private editor: SketchEditor) {
    this.baseline = this.contents();
    window.addEventListener("beforeunload", this.beforeUnload);
  }
  private contents(): string {
    return documentArchive(this.editor.store.data);
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.contents() !== this.baseline) {
      event.preventDefault();
      event.returnValue = "";
    }
  };
  private blocked(): boolean {
    return this.active || this.editor.blocked || !!this.editor.interactions.current;
  }
  private canReplace(): Promise<boolean> {
    return this.contents() !== this.baseline
      ? confirmReplacement(() => this.save())
      : Promise.resolve(true);
  }
  async save(saveAs = false): Promise<boolean> {
    if (this.blocked()) return false;
    this.active = true;
    const editor = this.editor;
    editor.store.busy = true;
    editor.refresh();
    try {
      const destination = !saveAs && this.handle ? this.handle : await pickSaveFile(this.filename);
      const saved = this.contents();
      const data = await this.codec.run(
        {
          kind: "write",
          model: documentArchive(editor.store.data, captureCamera(editor.world)),
          files: this.files,
        },
        editor,
      );
      editor.store.busy = true;
      if (!(data instanceof Uint8Array)) throw new Error("Invalid archive result.");
      if (destination) await writeBrowserFile(destination, data);
      else downloadArchive(data, this.filename);
      this.handle = destination;
      this.filename = destination?.name ?? this.filename;
      this.baseline = saved;
      editor.notice = destination
        ? `Saved ${this.filename}`
        : `Downloaded ${this.filename} · Keep it in Files to reopen later`;
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
    const editor = this.editor;
    if (!(await editor.newDocument())) return;
    this.files = {};
    this.filename = "Untitled.makeshift";
    this.handle = undefined;
    this.baseline = this.contents();
    this.editor.world.exit();
    restoreCamera(this.editor.world, undefined);
  }
  async open(file: File): Promise<void> {
    if (this.blocked() || !(await this.canReplace()) || this.blocked()) return;
    this.active = true;
    const editor = this.editor;
    editor.store.busy = true;
    editor.message = "Opening document…";
    editor.refresh();
    try {
      if (file.size > 72 * 1024 * 1024) throw new Error("Document is too large.");
      const archive = await this.codec.run(
        { kind: "read", bytes: new Uint8Array(await file.arrayBuffer()) },
        editor,
      );
      if (archive instanceof Uint8Array) throw new Error("Invalid archive result.");
      if (!(await editor.store.request({ kind: "open", document: archive.document }))) return;
      this.files = archive.files;
      this.filename = file.name.replace(/\.freac$/i, ".makeshift");
      this.handle = undefined;
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
    this.codec.dispose();
  }
}
