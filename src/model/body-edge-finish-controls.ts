import { edgeFinishSurfacePlan } from "../guides/edge-finish-targets.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { BodyEdgeFinish } from "./body.js";
import { BodyEdgeFinishWidget } from "./body-edge-finish-widget.js";
import { selectedEdgeFrame } from "./edge-finish-direction.js";
import { EdgeFinishDrag } from "./edge-finish-drag.js";
import { edgeFinishInputs } from "./edge-finish-inputs.js";
import { pickFinishTarget, refineFinishEdges } from "./edge-finish-refinement.js";
import { EdgeFinishSelection } from "./edge-finish-selection.js";
import { PreviewRunner } from "./preview-runner.js";

export class BodyEdgeFinishControls {
  private widget: BodyEdgeFinishWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private selection: EdgeFinishSelection;
  private frame: ReturnType<typeof selectedEdgeFrame> = null;
  private size = 0;
  private mode: BodyEdgeFinish["mode"] = "fillet";
  private valid = false;
  private invalid = false;
  private previews = new PreviewRunner<BodyEdgeFinish>({
    editing: () => this.lease?.phase === "editing",
    calculate: (request) => this.calculate(request),
    supersede: () => this.editor.store.supersedePreview(),
    settled: () => this.editor.refresh(),
  });
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
    this.drag = new EdgeFinishDrag(
      editor,
      this.widget,
      this.abort.signal,
      (mode) => this.begin(mode),
      () => this.lease,
      () => this.size,
      (size) => this.queue(size),
      () => this.focus(),
      () =>
        edgeFinishSurfacePlan(editor, this.frame, this.mode, async (size) => {
          await this.previews.settle();
          return (
            this.lease?.phase === "editing" &&
            this.valid &&
            !this.invalid &&
            Math.abs(this.size - size) < 1e-6
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
      size: (value) => this.queue(value),
      active: () => !!this.lease,
      finish: () => void this.finish(),
      cancel: () => void this.cancel(),
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  setMode(mode: BodyEdgeFinish["mode"]): void {
    if (this.editor.blocked || this.drag.active) return;
    this.editor.modeling.setTool(mode);
    this.mode = mode;
    this.widget.radial.update(mode !== "chamfer");
    if (this.lease) {
      this.previews.clear();
      this.valid = false;
      this.lease.show(null);
      if (this.selection.edges.length) {
        this.previews.check(() => this.expandSelection());
        this.queue(this.size);
      }
      this.lease.history?.checkpoint();
    } else this.begin(mode);
    this.editor.refresh();
  }
  async reopen(operation: BodyEdgeFinish): Promise<void> {
    this.mode = operation.mode;
    this.editor.modeling.setTool(operation.mode);
    this.update();
    if (!this.begin(operation.mode, operation))
      throw new Error("Cannot restore edge finish inputs");
    this.queue(operation.size);
    await this.previews.settle();
    if (!this.valid) throw new Error("Cannot regenerate the accepted edge finish");
    this.focus();
  }
  private begin(mode: BodyEdgeFinish["mode"], restored?: BodyEdgeFinish): boolean {
    if (this.lease) return this.mode === mode && this.lease.phase === "editing";
    if (this.editor.blocked || this.editor.world.active) return false;
    this.mode = mode;
    this.widget.radial.update(mode !== "chamfer");
    this.frame = selectedEdgeFrame(this.editor, mode, restored?.edges);
    if (restored && !this.frame) return false;
    this.lease = this.editor.interactions.acquire(
      "body-edge-finish",
      () => this.cancel(),
      () => this.finish(true),
      {
        navigation: "when-released",
        selectsLocally: () => true,
        settled: () => this.previews.settle(),
        refineSelection: (event) => this.refine(event),
      },
    );
    if (!this.lease) return false;
    this.selection.begin(this.frame?.edges ?? [], !!restored);
    this.editor.modeling.setTool(mode);
    this.size = restored?.size ?? 0;
    this.widget.input.value = String(this.widget.radial.display(this.size));
    this.valid = false;
    this.invalid = false;
    this.previews.clear();
    this.editor.notice = `${mode === "fillet" ? "Fillet" : "Chamfer"} · Drag or enter a size · Shift/Command-click adds edges or face boundaries · Option-click removes`;
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    if (!restored && this.selection.edges.length) this.previews.check(() => this.expandSelection());
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        size: this.size,
        mode: this.mode,
        edges: structuredClone(this.selection.edges),
      }),
      async (state) => {
        this.mode = state.mode;
        this.size = state.size;
        this.replaceEdges(state.edges);
        this.widget.input.value = String(this.widget.radial.display(state.size));
        this.queue(state.size);
        await this.previews.settle();
      },
    );
    this.editor.refresh();
    return true;
  }
  private refine(event: MouseEvent): void {
    const target = pickFinishTarget(this.editor, event);
    if (!target) {
      if (!(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey)) void this.finish();
      return;
    }
    const edges = refineFinishEdges(
      this.editor.store.data,
      this.selection.edges,
      target,
      true,
      event.altKey,
    );
    if (!edges) {
      this.editor.notice = "Select a solid edge or face boundary";
      this.editor.refresh();
      return;
    }
    this.lease?.history?.checkpoint();
    if (target.kind === "edge" && target.point)
      this.editor.modeling.lastEdgeClick = {
        body: target.body,
        edge: target.edge,
        point: target.point,
      };
    this.replaceEdges(edges);
    this.lease?.history?.checkpoint();
  }
  private replaceEdges(edges: BodyEdgeFinish["edges"]): void {
    this.previews.clear();
    this.valid = false;
    this.invalid = false;
    this.lease?.show(null);
    this.selection.edges = structuredClone(edges);
    this.selection.show();
    this.editor.modeling.setTool(this.mode);
    this.frame = selectedEdgeFrame(this.editor, this.mode, edges);
    if (edges.length) this.queue(this.size);
    else {
      this.editor.notice =
        "Select edges · Shift/Command-click adds edges or face boundaries · Option-click removes";
      this.editor.refresh();
    }
  }
  private async expandSelection(): Promise<void> {
    const success = await this.selection.expand(this.mode);
    if (this.lease?.phase !== "editing") return;
    this.selection.show();
    this.editor.modeling.setTool(this.mode);
    if (!success) {
      this.previews.clear();
      this.valid = false;
      this.invalid = true;
      this.lease.show(null);
      this.editor.notice =
        "Selected edges cannot be finished · Try another mode or cancel to change selection";
      this.editor.refresh();
      return;
    }
    this.editor.notice = `${this.mode === "fillet" ? "Fillet" : "Chamfer"} · ${this.selection.edges.length} selected edges · Drag or enter a size · Shift/Command-click adds edges or face boundaries · Option-click removes`;
    this.editor.refresh();
  }
  private focus(): void {
    this.editor.refresh();
    this.widget.input.focus();
    this.widget.input.select();
  }
  private queue(size: number): void {
    if (this.lease?.phase !== "editing") return;
    if (!this.selection.edges.length) {
      this.size = Math.max(0, size);
      this.editor.refresh();
      return;
    }
    if (size < 0) this.widget.input.value = "0";
    if (this.previews.latest?.size === Math.max(0, size)) {
      if (this.valid && this.size !== this.previews.latest.size) {
        this.widget.input.value = String(this.widget.radial.display(this.size));
        this.drag.rebase(this.size);
      }
      return;
    }
    this.size = Math.max(0, size);
    this.valid = false;
    if (!Number.isFinite(size)) {
      this.previews.clear();
      this.lease.show(null);
      this.invalid = true;
      this.editor.notice = "Enter a finite size";
      this.editor.refresh();
      return;
    }
    this.editor.notice = `${this.mode === "fillet" ? "Fillet" : "Chamfer"} · ${this.selection.edges.length} selected edge${this.selection.edges.length === 1 ? "" : "s"} · Enter to accept · Escape to cancel`;
    this.previews.enqueue({
      edges: this.selection.edges,
      size: Math.max(0, size),
      mode: this.mode,
    });
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
        if (this.lease?.phase !== "editing" || !this.previews.latest) return;
        this.lease.showVisual(preview);
        if (request === this.previews.latest) this.measure(request);
        this.editor.refresh();
      },
    );
    const latest = this.previews.latest;
    if (this.lease?.phase === "editing" && latest) {
      this.valid = success && request === latest;
      if (request === latest) {
        this.invalid = !success || (this.editor.store.edgeSize ?? 0) !== request.size;
        if (!success) this.lease.show(null);
      }
      if (success) {
        this.lease.show(this.editor.store.candidate);
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
      this.drag.rebase(this.size);
    }
  }
  private async finish(discardIncomplete = false): Promise<boolean> {
    await this.previews.settle();
    const lease = this.lease;
    if (this.drag.active || !lease) return false;
    if (!this.selection.edges.length) {
      if (!discardIncomplete) return false;
      await this.cancel();
      return true;
    }
    if (this.size === 0 && (!this.selection.restored || !this.previews.latest)) {
      await this.cancel();
      return true;
    }
    if (!this.valid) return false;
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
    this.previews.clear();
    this.drag.clear();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.previews.settle();
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
    if (!selection || (!selection.frame && !this.lease)) {
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
      this.lease ? this.size : 0,
      this.valid && (this.size > 0 || !!this.selection.restored),
      this.editor.blocked,
      !!this.lease && this.invalid,
      this.lease && !this.selection.edges.length ? "Select at least one solid face or edge." : "",
    );
  };
  dispose(): void {
    this.previews.clear();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
