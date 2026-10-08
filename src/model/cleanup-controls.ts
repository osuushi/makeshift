import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { Vector } from "../sketch/planes.js";
import type { CleanupSelection } from "./cleanup.js";
import { selectionAnchor } from "./selection-anchor.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./cleanup.css";

export class CleanupControls {
  private root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  private status = document.createElement("span");
  private accept = document.createElement("button");
  private lease: InteractionLease | null = null;
  private selection: CleanupSelection[] = [];
  private center: Vector = [0, 0, 0];
  private valid = false;
  private running: Promise<void> | null = null;
  private abort = new AbortController();
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.className = "cleanup-widget";
    this.root.hidden = true;
    this.accept.textContent = "Accept";
    this.accept.setAttribute("aria-label", "Accept cleanup");
    this.accept.onclick = () => void this.finish();
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.setAttribute("aria-label", "Cancel cleanup");
    cancel.onclick = () => void this.cancel();
    this.root.append(this.status, this.accept, cancel);
    overlay.append(this.root);
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { signal: this.abort.signal, capture: true },
    );
    editor.world.changed.add(this.update);
  }
  async reopen(selection: CleanupSelection[]): Promise<void> {
    this.start(selection);
    if (!this.lease) throw new Error("Cannot restore cleanup selection");
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted cleanup");
    this.accept.focus();
  }
  start = (restored?: CleanupSelection[]): void => {
    const editor = this.editor;
    if (editor.blocked || editor.world.active || editor.interactions.current) return;
    const resolution = editor.modeling.resolve("cleanup");
    if (!resolution.available) return;
    this.selection = restored ? structuredClone(restored) : resolution.inputs;
    if (!this.selection.length) return;
    this.center = selectionAnchor(editor);
    this.lease = editor.interactions.acquire(
      "cleanup",
      () => this.cancel(),
      () => this.finish(),
      {
        navigation: "when-released",
        settled: async () => {
          await this.running;
        },
      },
    );
    if (!this.lease) return;
    // Reopened cleanup has no editable parameters; baseline Undo cancels it.
    if (restored)
      this.lease.trackHistory(
        this.root,
        () => null,
        () => {},
      );
    this.valid = false;
    this.status.textContent = "Cleaning up…";
    this.root.hidden = false;
    this.running = this.preview();
    editor.refresh();
  };
  private async preview(): Promise<void> {
    const before = this.editor.store.data;
    const ok = await this.editor.store.request({ kind: "cleanup", selection: this.selection });
    if (this.lease?.phase !== "editing") return;
    this.valid = ok;
    const after = this.editor.store.candidate;
    this.lease.show(ok ? after : null);
    const count = (key: "faces" | "edges") =>
      (before.bodies ?? []).reduce((n, b) => n + b[key].length, 0) -
      (after?.bodies ?? []).reduce((n, b) => n + b[key].length, 0);
    this.status.textContent = !ok
      ? "Cleanup failed"
      : count("faces") || count("edges")
        ? `Clean up · ${count("faces")} fewer faces · ${count("edges")} fewer edges`
        : "No redundant topology in selection";
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || !this.valid || !lease.close()) return false;
    const ok = await this.editor.accept();
    if (ok) {
      const bodies = new Set(this.selection.map((s) => s.body));
      this.editor.modeling.targets = (this.editor.store.data.bodies ?? [])
        .filter((b) => bodies.has(b.id))
        .map((b) => ({ kind: "body", body: b.id }));
    }
    this.end(lease);
    return ok;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.lease = null;
    this.root.hidden = true;
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) return;
    this.accept.disabled = !this.valid || this.editor.blocked;
    const p = this.editor.world.project(this.center);
    this.root.style.left = `${Math.max(220, Math.min(innerWidth - 220, p.x))}px`;
    this.root.style.top = `${Math.max(60, Math.min(innerHeight - 70, p.y + 110))}px`;
    this.placement.fit([this.root]);
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.placement.dispose();
    this.root.remove();
  }
}
