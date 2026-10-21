import type { SketchEditor } from "../sketch/editor.js";
import { BrowserArchive, downloadArchive } from "./browser-archive.js";
import { confirmReplacement, pickSaveFile, writeBrowserFile } from "./browser-file-access.js";
import { browserLibrary } from "./browser-library.js";
import { chooseDrawing, drawingName } from "./browser-library-dialog.js";
import { captureCamera, restoreCamera } from "./camera-state.js";
import { documentArchive } from "./document-archive.js";
import type { PortableFiles } from "./portable-files.js";

/** Browser file identity and portable bytes remain outside geometry and Undo. */
export class BrowserDocuments {
  private files: PortableFiles = {};
  private filename = "Untitled.makeshift";
  private drawingId: string | undefined;
  private codec = new BrowserArchive();
  private baseline: string;
  private active = false;
  get name(): string {
    return this.filename;
  }
  constructor(private editor: SketchEditor) {
    this.baseline = this.contents();
    window.addEventListener("beforeunload", this.beforeUnload);
    if (editor.store.busy) editor.world.changed.add(this.initialBaseline);
  }
  private initialBaseline = (): void => {
    if (this.editor.store.busy) return;
    this.baseline = this.contents();
    this.editor.world.changed.delete(this.initialBaseline);
  };
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
  async save(saveAs = false, download = false): Promise<boolean> {
    if (this.blocked()) return false;
    this.active = true;
    const editor = this.editor;
    editor.store.busy = true;
    editor.refresh();
    try {
      const name =
        saveAs || download || !this.drawingId ? await drawingName(this.filename) : this.filename;
      if (!name) return false;
      const destination = download ? await pickSaveFile(name) : undefined;
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
      if (download) {
        if (destination) await writeBrowserFile(destination, data);
        else downloadArchive(data, name);
        editor.notice = `Downloaded ${name}`;
      } else {
        const id = !saveAs && this.drawingId ? this.drawingId : crypto.randomUUID();
        await browserLibrary.save({ id, name, bytes: data, modified: Date.now() });
        this.drawingId = id;
        this.filename = name;
        this.baseline = saved;
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
    const editor = this.editor;
    if (!(await editor.newDocument())) return;
    this.files = {};
    this.filename = "Untitled.makeshift";
    this.drawingId = undefined;
    this.baseline = this.contents();
    this.editor.world.exit();
    restoreCamera(this.editor.world, undefined);
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
      if (file.size > 72 * 1024 * 1024) throw new Error("Document is too large.");
      const archive = await this.codec.run(
        { kind: "read", bytes: new Uint8Array(await file.arrayBuffer()) },
        editor,
      );
      if (archive instanceof Uint8Array) throw new Error("Invalid archive result.");
      if (!(await editor.store.request({ kind: "open", document: archive.document }))) return;
      this.files = archive.files;
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
    this.editor.world.changed.delete(this.initialBaseline);
    this.codec.dispose();
  }
}
