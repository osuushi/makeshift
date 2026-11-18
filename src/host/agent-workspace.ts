import { type FSWatcher, watch } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type PortableFiles, validatePortable } from "../model/portable-files.js";
import { workspaceDigest, workspaceSnapshot } from "./workspace-files.js";

/** Local file ownership is separate from geometry Undo. Old roots are retained for recovery. */
export class AgentWorkspace {
  root: string | null = null;
  private baseline = workspaceDigest({});
  private current = this.baseline;
  private watcher: FSWatcher | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private scanning: Promise<void> | null = null;
  error: string | undefined;
  beforeSnapshot = () => Promise.resolve();
  onAdopt: (files: PortableFiles) => void = () => {};
  changed = (): void => {};
  constructor(readonly directory: string) {}
  get cwd(): string | null {
    return this.root ? join(this.root, "workspace") : null;
  }
  get codexHome(): string | null {
    return this.root ? join(this.root, "codex") : null;
  }
  get dirty(): boolean {
    return !!this.error || this.current !== this.baseline;
  }
  async prepare(files: PortableFiles): Promise<string> {
    validatePortable(files);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const root = await mkdtemp(join(this.directory, "document-"));
    await mkdir(join(root, "workspace"));
    await mkdir(join(root, "codex"));
    for (const [path, bytes] of Object.entries(files)) {
      const relative = path.startsWith("workspace/")
        ? path
        : path.replace("conversations/codex/", "codex/");
      const destination = join(root, relative);
      await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
      await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
    }
    return root;
  }
  async ensure(): Promise<void> {
    if (!this.root) this.adopt(await this.prepare({}), {});
  }
  adopt(root: string | null, files: PortableFiles): void {
    this.watcher?.close();
    clearTimeout(this.timer);
    this.root = root;
    this.onAdopt(files);
    this.error = undefined;
    this.baseline = this.current = workspaceDigest(files);
    if (root) {
      try {
        this.watcher = watch(root, { recursive: true }, (_event, filename) => {
          const path = String(filename ?? "").replaceAll("\\", "/");
          if (
            path &&
            !path.startsWith("workspace") &&
            !path.startsWith("codex/sessions") &&
            !path.startsWith("codex/archived_sessions")
          )
            return;
          // Mark potentially dirty immediately; settle to exact bytes after the write burst.
          this.current = "pending";
          this.changed();
          clearTimeout(this.timer);
          this.timer = setTimeout(() => void this.refresh(), 150);
        });
        this.watcher.on("error", (error) => {
          this.error = error.message;
          this.changed();
        });
      } catch (error) {
        this.watcher = null;
        this.error = String(error);
      }
    } else this.watcher = null;
    this.changed();
  }
  async snapshot(): Promise<PortableFiles> {
    await this.beforeSnapshot();
    return this.root ? workspaceSnapshot(this.root) : {};
  }
  async refresh(): Promise<void> {
    while (this.scanning) {
      await this.scanning;
    }
    const root = this.root;
    this.scanning = (async () => {
      try {
        const files = root ? await workspaceSnapshot(root) : {};
        if (root === this.root) {
          this.current = workspaceDigest(files);
          this.error = undefined;
        }
      } catch (error) {
        if (root === this.root) this.error = String(error);
      }
      if (root === this.root) this.changed();
    })();
    try {
      await this.scanning;
    } finally {
      this.scanning = null;
    }
  }
  saved(files: PortableFiles): void {
    this.baseline = workspaceDigest(files);
    // Rescan after the atomic write to catch writes after snapshot capture.
    void this.refresh();
  }
  recovered(root: string, files: PortableFiles): void {
    this.adopt(root, files);
    this.baseline = workspaceDigest({});
    this.changed();
  }
}
