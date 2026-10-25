import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { BodyEdgeFinish } from "./body.js";
import type { BodyEdgeFinishWidget } from "./body-edge-finish-widget.js";
import type { EdgeFinishSelection } from "./edge-finish-selection.js";
import { PreviewRunner } from "./preview-runner.js";

/** Provisional size/mesh while editing; exact measurements only on completion. */
export class EdgeFinishPreview {
  size = 0;
  valid = false;
  invalid = false;
  readonly runner = new PreviewRunner<BodyEdgeFinish>({
    editing: () => this.lease()?.phase === "editing",
    calculate: (request) => this.calculate(request),
    supersede: () => this.editor.store.supersedePreview(),
    settled: () => this.editor.refresh(),
  });
  constructor(
    private editor: SketchEditor,
    private widget: BodyEdgeFinishWidget,
    private selection: EdgeFinishSelection,
    private lease: () => InteractionLease | null,
    private mode: () => BodyEdgeFinish["mode"],
    private rebase: (size: number) => void,
  ) {}

  queue(size: number): void {
    const lease = this.lease();
    if (lease?.phase !== "editing") return;
    if (size < 0) this.widget.input.value = "0";
    if (this.runner.latest?.size === Math.max(0, size)) {
      if (this.valid && this.size !== this.runner.latest.size) {
        this.widget.input.value = String(this.widget.radial.display(this.size));
        this.rebase(this.size);
      }
      return;
    }
    this.size = Math.max(0, size);
    this.valid = false;
    if (!Number.isFinite(size)) {
      this.runner.clear();
      lease.show(null);
      this.invalid = true;
      this.editor.notice = "Enter a finite size";
      this.editor.refresh();
      return;
    }
    const mode = this.mode();
    this.editor.notice = `${mode === "fillet" ? "Fillet" : "Chamfer"} · ${this.selection.edges.length} selected edge${this.selection.edges.length === 1 ? "" : "s"} · Enter to accept · Escape to cancel`;
    this.runner.enqueue({ edges: this.selection.edges, size: Math.max(0, size), mode });
    this.editor.refresh();
  }

  private async calculate(request: BodyEdgeFinish): Promise<void> {
    const success = await this.editor.store.request(
      {
        kind: "finish-edges",
        operation: { ...request, edges: this.selection.edges },
        presentation: "deferred",
      },
      (preview) => {
        const lease = this.lease();
        if (lease?.phase !== "editing" || !this.runner.latest) return;
        lease.showVisual(preview);
        if (request === this.runner.latest) this.measure(request);
        this.editor.refresh();
      },
    );
    const latest = this.runner.latest,
      lease = this.lease();
    if (lease?.phase === "editing" && latest) {
      this.valid = success && request === latest;
      if (request === latest) {
        this.invalid = !success || (this.editor.store.edgeSize ?? 0) !== request.size;
        if (!success) lease.show(null);
      }
      if (success) {
        const visual = this.editor.store.visualPreview;
        if (visual) lease.showVisual(visual);
        else lease.show(this.editor.store.candidate);
        if (request === latest) this.measure(request);
      }
    }
    this.editor.refresh();
  }

  private measure(request: BodyEdgeFinish): void {
    this.size = this.editor.store.edgeSize ?? 0;
    this.invalid = this.size !== request.size;
    if (this.invalid) {
      this.widget.input.value = String(this.widget.radial.display(this.size));
      this.editor.notice = `Limited to ${this.widget.radial.display(this.size)} mm`;
      this.rebase(this.size);
    }
  }

  async complete(lease: InteractionLease): Promise<boolean> {
    if (!this.editor.store.visualPreview) return true;
    if (!lease.wait()) return false;
    const success = await this.editor.store.request({ kind: "complete-preview" });
    if (this.lease() !== lease || lease.phase !== "waiting") return false;
    lease.resume();
    if (!success) {
      this.valid = false;
      this.invalid = true;
      this.runner.clear();
      lease.show(null);
    }
    this.editor.refresh();
    return success;
  }
}
