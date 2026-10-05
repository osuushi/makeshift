import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { BodyEdgeFinish } from "./body.js";
import { BodyEdgeFinishWidget } from "./body-edge-finish-widget.js";
import { EdgeFinishCleanup } from "./edge-finish-cleanup.js";
import { selectedEdgeFrame } from "./edge-finish-direction.js";
import { EdgeFinishDrag } from "./edge-finish-drag.js";
import { PreviewRunner } from "./preview-runner.js";

export class BodyEdgeFinishControls {
  private cleanup: EdgeFinishCleanup;
  private widget: BodyEdgeFinishWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private edges: BodyEdgeFinish["edges"] = [];
  private frame: ReturnType<typeof selectedEdgeFrame> = null;
  private size = 0;
  private mode: BodyEdgeFinish["mode"] = "fillet";
  private valid = false;
  private invalid = false;
  private previews = new PreviewRunner<BodyEdgeFinish>({
    editing: () => this.lease?.phase === "editing",
    calculate: (request) => this.calculate(request),
    supersede: () => this.editor.store.supersedePreview(),
    settled: (calculated) => this.cleanup.settled(calculated),
  });
  private drag: EdgeFinishDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new BodyEdgeFinishWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.cleanup = new EdgeFinishCleanup(
      editor,
      this.widget.cleanup,
      this.previews,
      () => this.valid && this.size > 0 && this.lease?.phase === "editing",
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
    );
    this.widget.bind(this.abort.signal, {
      begin: () => this.begin(this.mode),
      activate: (mode) => {
        if (this.begin(mode)) this.focus();
      },
      chooseMode: (mode) => {
        if (mode !== this.mode) this.setMode(mode);
        else if (this.begin(mode)) this.focus();
      },
      size: (value) => this.queue(value),
    });
    this.widget.cleanup.onclick = () => void this.finish(true);
    const options = { signal: this.abort.signal };
    onModelKeydown(
      (event) => {
        if (!this.lease || !["Enter", "Escape"].includes(event.key)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") void this.cancel();
        else void this.finish();
      },
      { ...options, capture: true },
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  setMode(mode: BodyEdgeFinish["mode"]): void {
    if (this.editor.blocked || this.drag.active) return;
    const faces =
      !this.lease && this.editor.modeling.targets.some((target) => target.kind === "face");
    if (this.mode === mode && !faces) return;
    this.cleanup.reset();
    this.editor.modeling.setTool(mode);
    this.mode = mode;
    if (this.lease) {
      this.previews.clear();
      this.valid = false;
      this.lease.show(null);
      this.previews.check(() => this.expandSelection());
      this.queue(this.size);
      this.lease.history?.checkpoint();
    } else if (faces && this.begin(mode)) this.focus();
    this.editor.refresh();
  }
  private begin(mode: BodyEdgeFinish["mode"]): boolean {
    if (this.lease) return this.mode === mode && this.lease.phase === "editing";
    if (this.editor.blocked || this.editor.world.active) return false;
    this.mode = mode;
    this.frame = selectedEdgeFrame(this.editor, mode);
    if (!this.frame) return false;
    this.edges = this.frame.edges;
    this.lease = this.editor.interactions.acquire(
      "body-edge-finish",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return false;
    this.editor.modeling.targets = this.edges.map((edge) => ({ kind: "edge", ...edge }));
    this.editor.modeling.setTool(mode);
    this.size = 0;
    this.valid = false;
    this.invalid = false;
    this.previews.clear();
    this.editor.notice = `${mode === "fillet" ? "Fillet" : "Chamfer"} · Drag or enter a size`;
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.previews.check(() => this.expandSelection());
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        size: this.previews.latest?.size ?? 0,
        mode: this.mode,
      }),
      async (state) => {
        this.setMode(state.mode);
        this.widget.input.value = String(state.size);
        this.queue(state.size);
        await this.previews.settle();
      },
    );
    this.editor.refresh();
    return true;
  }
  private async expandSelection(): Promise<void> {
    const success = await this.editor.store.request({
      kind: "edge-finish-selection",
      operation: { edges: this.edges, mode: this.mode },
    });
    if (success) this.edges = this.editor.store.edgeSelection;
    if (this.lease?.phase !== "editing") return;
    this.editor.modeling.targets = this.edges.map((edge) => ({ kind: "edge", ...edge }));
    this.editor.modeling.setTool(this.mode);
    if (!success) {
      this.previews.clear();
      void this.cancel();
      return;
    }
    this.editor.notice = `${this.mode === "fillet" ? "Fillet" : "Chamfer"} · ${this.edges.length} selected edges · Drag or enter a size`;
    this.editor.refresh();
  }
  private focus(): void {
    this.editor.refresh();
    this.widget.input.focus();
    this.widget.input.select();
  }
  private queue(size: number): void {
    if (this.lease?.phase !== "editing") return;
    if (size < 0) this.widget.input.value = "0";
    if (this.previews.latest?.size === Math.max(0, size)) {
      if (this.valid && this.size !== this.previews.latest.size) {
        this.widget.input.value = String(this.size);
        this.drag.rebase(this.size);
      }
      return;
    }
    this.cleanup.reset(Number.isFinite(size) && size > 0);
    this.valid = false;
    if (!Number.isFinite(size)) {
      this.previews.clear();
      this.lease.show(null);
      this.invalid = true;
      this.editor.notice = "Enter a finite size";
      this.editor.refresh();
      return;
    }
    this.editor.notice = `${this.mode === "fillet" ? "Fillet" : "Chamfer"} · ${this.edges.length} selected edge${this.edges.length === 1 ? "" : "s"} · Enter to accept · Escape to cancel`;
    this.previews.enqueue({ edges: this.edges, size: Math.max(0, size), mode: this.mode });
    this.editor.refresh();
  }
  private async calculate(request: BodyEdgeFinish): Promise<void> {
    const success = await this.editor.store.request({
      kind: "finish-edges",
      operation: { ...request, edges: this.edges },
    });
    const latest = this.previews.latest;
    if (this.lease?.phase === "editing" && latest) {
      this.valid = success && request === latest;
      if (request === latest) {
        this.invalid = !success || (this.editor.store.edgeSize ?? 0) !== request.size;
        if (!success) this.lease.show(null);
      }
      if (success) {
        this.lease.show(this.editor.store.candidate);
        this.size = this.editor.store.edgeSize ?? 0;
        if (request === latest && this.size !== request.size) {
          this.widget.input.value = String(this.size);
          this.editor.notice = `Limited to ${this.size} mm`;
          this.drag.rebase(this.size);
        }
      }
    }
    this.editor.refresh();
  }
  private async finish(cleanup = false): Promise<boolean> {
    await this.previews.settle();
    const lease = this.lease;
    if (this.drag.active || !lease) return false;
    if (!this.previews.latest && this.size === 0) {
      await this.cancel();
      return true;
    }
    if (!this.valid) return false;
    if (this.size === 0) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    const ids = new Set(this.edges.map((e) => e.body));
    const success = await this.editor.accept(cleanup);
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    if (success)
      this.editor.modeling.targets = (this.editor.store.data.bodies ?? [])
        .filter((body) => ids.has(body.id))
        .map((body) => ({ kind: "body", body: body.id }));
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
    this.editor.modeling.targets = this.edges.map((edge) => ({ kind: "edge", ...edge }));
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.widget.input.blur();
    this.cleanup.reset();
    this.lease = null;
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    this.cleanup.update(!!this.lease && this.size > 0, this.editor.blocked || !this.valid);
    if (!this.lease) {
      const tool = this.editor.modeling.tool;
      if (
        this.editor.world.active ||
        this.editor.interactions.current ||
        (tool !== "fillet" && tool !== "chamfer")
      ) {
        this.widget.root.hidden = true;
        return;
      }
      this.mode = tool;
      this.frame = selectedEdgeFrame(this.editor, tool);
    }
    const frame = this.frame;
    if (!frame) {
      this.widget.root.hidden = true;
      return;
    }
    this.widget.update(
      this.editor.world,
      frame,
      this.mode,
      !!this.lease,
      this.lease ? this.size : 0,
      this.valid,
      this.editor.blocked,
      !!this.lease && this.invalid,
    );
  };
  dispose(): void {
    this.previews.clear();
    this.cleanup.reset();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
