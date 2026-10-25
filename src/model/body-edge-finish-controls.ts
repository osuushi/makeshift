import { edgeFinishSurfacePlan } from "../guides/edge-finish-targets.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { BodyEdgeFinish } from "./body.js";
import { BodyEdgeFinishWidget } from "./body-edge-finish-widget.js";
import { selectedEdgeFrame } from "./edge-finish-direction.js";
import { EdgeFinishDrag } from "./edge-finish-drag.js";
import { edgeFinishInputs } from "./edge-finish-inputs.js";
import { EdgeFinishPreview } from "./edge-finish-preview.js";
import { EdgeFinishSelection } from "./edge-finish-selection.js";

export class BodyEdgeFinishControls {
  private widget: BodyEdgeFinishWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private selection: EdgeFinishSelection;
  private frame: ReturnType<typeof selectedEdgeFrame> = null;
  private mode: BodyEdgeFinish["mode"] = "fillet";
  private preview: EdgeFinishPreview;
  private drag: EdgeFinishDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.selection = new EdgeFinishSelection(editor);
    this.widget = new BodyEdgeFinishWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.preview = new EdgeFinishPreview(
      editor,
      this.widget,
      this.selection,
      () => this.lease,
      () => this.mode,
      (size) => this.drag.rebase(size),
    );
    this.drag = new EdgeFinishDrag(
      editor,
      this.widget,
      this.abort.signal,
      (mode) => this.begin(mode),
      () => this.lease,
      () => this.preview.size,
      (size) => this.preview.queue(size),
      () => this.focus(),
      () =>
        edgeFinishSurfacePlan(editor, this.frame, this.mode, async (size) => {
          await this.preview.runner.settle();
          return (
            this.lease?.phase === "editing" &&
            this.preview.valid &&
            !this.preview.invalid &&
            Math.abs(this.preview.size - size) < 1e-6
          );
        }),
    );
    edgeFinishInputs(this.widget, this.abort.signal, {
      begin: () => this.begin(this.mode),
      activate: (mode) => {
        if (this.begin(mode)) this.focus();
      },
      chooseMode: (mode) => {
        if (mode !== this.mode) this.setMode(mode);
        else if (this.begin(mode)) this.focus();
      },
      size: (value) => this.preview.queue(value),
      active: () => !!this.lease,
      finish: () => void this.finish(),
      cancel: () => void this.cancel(),
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  setMode(mode: BodyEdgeFinish["mode"]): void {
    if (this.editor.blocked || this.drag.active) return;
    const faces =
      !this.lease && this.editor.modeling.targets.some((target) => target.kind === "face");
    if (this.mode === mode && !faces) return;
    this.editor.modeling.setTool(mode);
    this.mode = mode;
    this.widget.radial.update(mode !== "chamfer");
    if (this.lease) {
      this.preview.runner.clear();
      this.preview.valid = false;
      this.lease.show(null);
      this.preview.runner.check(() => this.expandSelection());
      this.preview.queue(this.preview.size);
      this.lease.history?.checkpoint();
    } else if (faces && this.begin(mode)) this.focus();
    this.editor.refresh();
  }
  async reopen(operation: BodyEdgeFinish): Promise<void> {
    this.mode = operation.mode;
    this.editor.modeling.setTool(operation.mode);
    this.update();
    if (!this.begin(operation.mode, operation))
      throw new Error("Cannot restore edge finish inputs");
    this.preview.queue(operation.size);
    await this.preview.runner.settle();
    if (!this.preview.valid) throw new Error("Cannot regenerate the accepted edge finish");
    this.focus();
  }
  private begin(mode: BodyEdgeFinish["mode"], restored?: BodyEdgeFinish): boolean {
    if (this.lease) return this.mode === mode && this.lease.phase === "editing";
    if (this.editor.blocked || this.editor.world.active) return false;
    this.mode = mode;
    this.widget.radial.update(mode !== "chamfer");
    this.frame = selectedEdgeFrame(this.editor, mode, restored?.edges);
    if (!this.frame) return false;
    this.lease = this.editor.interactions.acquire(
      "body-edge-finish",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released", settled: () => this.preview.runner.settle() },
    );
    if (!this.lease) return false;
    this.selection.begin(this.frame.edges, !!restored);
    this.editor.modeling.setTool(mode);
    this.preview.size = restored?.size ?? 0;
    this.widget.input.value = String(this.widget.radial.display(this.preview.size));
    this.preview.valid = false;
    this.preview.invalid = false;
    this.preview.runner.clear();
    this.editor.notice = `${mode === "fillet" ? "Fillet" : "Chamfer"} · Drag or enter a size`;
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    if (!restored) this.preview.runner.check(() => this.expandSelection());
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        size: this.preview.size,
        mode: this.mode,
      }),
      async (state) => {
        this.setMode(state.mode);
        this.widget.input.value = String(this.widget.radial.display(state.size));
        this.preview.queue(state.size);
        await this.preview.runner.settle();
      },
    );
    this.editor.refresh();
    return true;
  }
  private async expandSelection(): Promise<void> {
    const success = await this.selection.expand(this.mode);
    if (this.lease?.phase !== "editing") return;
    this.selection.show();
    this.editor.modeling.setTool(this.mode);
    if (!success) {
      this.preview.runner.clear();
      this.preview.valid = false;
      this.preview.invalid = true;
      this.lease.show(null);
      this.editor.notice =
        "Selected edges cannot be finished · Try another mode or cancel to change selection";
      this.editor.refresh();
      return;
    }
    this.editor.notice = `${this.mode === "fillet" ? "Fillet" : "Chamfer"} · ${this.selection.edges.length} selected edges · Drag or enter a size`;
    this.editor.refresh();
  }
  private focus(): void {
    this.editor.refresh();
    this.widget.input.focus();
    this.widget.input.select();
  }
  private async finish(): Promise<boolean> {
    await this.preview.runner.settle();
    const lease = this.lease;
    if (this.drag.active || !lease) return false;
    if (this.preview.size === 0 && (!this.selection.restored || !this.preview.runner.latest)) {
      await this.cancel();
      return true;
    }
    if (!this.preview.valid || !(await this.preview.complete(lease))) return false;
    if (!lease.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.selection.accept();
    this.end(lease);
    return success;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.preview.runner.clear();
    this.drag.clear();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.preview.runner.settle();
    this.selection.cancel();
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.selection.restored = undefined;
    this.widget.input.blur();
    this.lease = null;
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    const selection = this.lease ? { mode: this.mode, frame: this.frame } : this.selection.idle();
    if (!selection?.frame) {
      this.widget.root.hidden = true;
      return;
    }
    this.mode = selection.mode;
    this.frame = selection.frame;
    this.widget.update(
      this.editor.world,
      this.frame,
      this.mode,
      !!this.lease,
      this.lease ? this.preview.size : 0,
      this.preview.valid && (this.preview.size > 0 || !!this.selection.restored),
      this.editor.blocked,
      !!this.lease && this.preview.invalid,
    );
  };
  dispose(): void {
    this.preview.runner.clear();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
