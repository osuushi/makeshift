import type { GuideToolPlan } from "../guides/tool-path.js";
import { guideToolSession } from "../guides/tool-session.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import type { Extrusion, LiftSource } from "./body.js";
import { BooleanOperands } from "./boolean-operands.js";
import { extrusionGuidePath } from "./extrude-guide.js";
import { trackExtrudeHistory } from "./extrude-history.js";
import type { ExtrudeInputs } from "./extrude-inputs.js";
import { ExtrudePreview } from "./extrude-preview.js";
import type { ExtrudeTargets } from "./extrude-targets.js";
import type { ExtrudeTwist } from "./extrude-twist.js";
import { createExtrudeView, updateExtrudeView } from "./extrude-view.js";
import type { ExtrudeWidget } from "./extrude-widget.js";
import { sourceExtrusion } from "./viewer-extrusion.js";

export class ExtrudeControls {
  private operands: BooleanOperands;
  private widget: ExtrudeWidget;
  readonly root: HTMLDivElement;
  private targets: ExtrudeTargets;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private sources: LiftSource[] = [];
  private mode: Extrusion["mode"] = "auto";
  private distance = 0;
  private symmetric = false;
  private previews: ExtrudePreview;
  private get valid(): boolean {
    return this.previews.valid;
  }
  private inputs: ExtrudeInputs;
  private twist: ExtrudeTwist;
  get active(): boolean {
    return !!this.lease;
  }
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.operands = new BooleanOperands(editor);
    this.previews = new ExtrudePreview(
      editor,
      () => this.lease,
      () => this.operands.showTool(),
    );
    const view = createExtrudeView(
      editor,
      overlay,
      {
        begin: () => this.begin(),
        lease: () => this.lease,
        active: () => this.active,
        distance: () => this.distance,
        symmetric: () => this.symmetric,
        queue: (value, symmetric) => this.queue(value, symmetric),
        released: () => this.previews.complete(),
        mode: (mode) => {
          this.mode = mode;
          this.queue(this.distance);
          this.lease?.history?.checkpoint();
        },
        finish: () => void this.finish(),
        cancel: () => void this.cancel(),
        guide: (point) => this.guide(point),
      },
      this.abort.signal,
      () => {
        if (this.mode === "auto") this.mode = editor.store.booleanMode ?? "auto";
        this.queue(this.distance);
      },
    );
    this.widget = view.widget;
    this.targets = view.targets;
    this.twist = view.twist;
    this.inputs = view.inputs;
    this.root = view.widget.root;
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(extrusion: Extrusion): Promise<void> {
    this.editor.modeling.setTool("extrude");
    this.editor.refresh();
    if (!this.begin(extrusion)) throw new Error("Cannot restore extrusion inputs");
    this.queue(this.distance, this.symmetric);
    await this.previews.settle();
    if (!this.valid) throw new Error("Cannot regenerate the accepted extrusion");
    this.widget.input.focus();
    this.widget.input.select();
  }
  guide(point: Vector): GuideToolPlan | null {
    if (this.editor.world.active || this.editor.modeling.tool !== "extrude") return null;
    if (this.twist.angle || this.widget.draft.value.value) return null;
    const path = extrusionGuidePath(this.editor, point, this.widget.axis, this.symmetric);
    if (!path) return null;
    return {
      path,
      begin: () => {
        const existing = !!this.lease;
        if (!this.begin() || !this.lease) return null;
        return guideToolSession({
          lease: this.lease,
          initial: this.distance,
          existing,
          queue: (distance) => this.queue(distance),
          settle: () => this.previews.settle(),
          valid: () => this.valid,
          distance: () => this.distance,
          cancel: () => this.cancel(),
        });
      },
    };
  }
  /** Guided tools hand off to the ordinary temporary extrusion interaction. */
  start(
    distance: number,
    symmetric: boolean,
    mode: Extrusion["mode"] = "auto",
    draft?: Extrusion["draft"],
    sourceDistance = false,
  ): boolean {
    this.editor.modeling.setTool("extrude");
    this.editor.refresh();
    if (!this.begin()) return false;
    this.mode = mode;
    if (draft) this.widget.draft.restore(draft);
    if (sourceDistance) distance *= this.widget.axis?.sourceSign ?? 1;
    this.queue(distance, symmetric);
    return true;
  }
  private begin(restored?: Extrusion): boolean {
    if (this.lease) return this.lease.phase === "editing";
    if (this.editor.blocked || this.editor.world.active || this.editor.modeling.tool !== "extrude")
      return false;
    const resolution = this.editor.modeling.resolve("extrude");
    if (!restored && !resolution.available) return false;
    this.sources = restored
      ? structuredClone(restored.sources)
      : resolution.available
        ? resolution.inputs
        : [];
    if (!this.sources.length) return false;
    this.lease = this.editor.interactions.acquire(
      "extrude",
      () => (this.twist.cancelGesture() ? undefined : this.cancel()),
      () => this.finish(),
      { navigation: "when-released", settled: () => this.previews.settle() },
    );
    this.previews.clear();
    this.targets.reset();
    this.mode = restored?.mode ?? "auto";
    const parameters = restored && sourceExtrusion(restored, this.widget.axis?.sourceSign ?? 1);
    this.widget.draft.restore(restored?.draft ?? { mode: "angle", value: 0 });
    this.distance = parameters?.distance ?? 0;
    this.symmetric = restored?.symmetric ?? false;
    this.previews.valid = false;
    this.twist.angle = parameters?.twist?.angle ?? 0;
    this.twist.origin =
      restored?.twist?.origin ?? (this.widget.axis ? [...this.widget.axis.center] : null);
    this.twist.input.value = String(this.twist.angle);
    this.targets.selected = restored?.targets;
    this.targets.restoredEligible = restored?.eligibleTargets;
    this.widget.input.value = String(this.widget.quantity.display(this.distance));
    trackExtrudeHistory(
      this.lease,
      this.widget,
      this.twist,
      this.targets,
      () => ({
        distance: this.distance,
        symmetric: this.symmetric,
        mode: this.mode,
      }),
      async (state) => {
        this.mode = state.mode;
        this.queue(state.distance, state.symmetric);
        await this.previews.settle();
      },
    );
    return !!this.lease;
  }
  private queue(value: number, symmetric = this.symmetric): void {
    this.symmetric = this.widget.axis?.normalExtrusion ? false : symmetric;
    if (
      !Number.isFinite(value) ||
      Math.abs(value) < 1e-8 ||
      !Number.isFinite(this.widget.draft.value.value) ||
      !Number.isFinite(this.twist.value?.angle ?? 0)
    ) {
      this.distance = value;
      this.previews.valid = false;
      this.previews.clear();
      this.editor.store.supersedePreview(true);
      this.lease?.show(null);
      this.editor.refresh();
      return;
    }
    const request = sourceExtrusion(
      {
        sources: this.sources,
        distance: value,
        symmetric: this.symmetric,
        draft: this.widget.draft.value,
        twist: this.twist.value,
        mode: this.mode,
        targets: this.targets.selected,
        eligibleTargets: this.targets.eligible,
      },
      this.widget.axis?.sourceSign ?? 1,
    );
    // Pointer events within one grid step do not require another calculation.
    if (JSON.stringify(request) === JSON.stringify(this.previews.latest)) return;
    this.distance = value;
    this.previews.valid = false;
    this.previews.enqueue(request);
    this.editor.refresh();
  }
  async finish(): Promise<boolean> {
    await this.previews.settle();
    if (this.lease && !this.previews.latest && this.distance === 0) {
      await this.cancel();
      return true;
    }
    if (!this.lease || this.lease.captured || !this.valid || !this.lease.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.lease.release();
    this.lease = null;
    this.widget.input.blur();
    this.distance = 0;
    this.symmetric = false;
    this.twist.reset();
    this.editor.refresh();
    return success;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.previews.clear();
    this.inputs.reset();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.previews.settle();
    lease.release();
    this.lease = null;
    this.widget.input.blur();
    this.distance = 0;
    this.symmetric = false;
    this.twist.reset();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease?.candidate) this.operands.clear();
    updateExtrudeView(
      this.editor,
      this,
      { widget: this.widget, twist: this.twist, targets: this.targets },
      {
        distance: this.distance,
        mode: this.mode === "auto" ? this.editor.store.booleanMode : this.mode,
        valid: this.valid,
        symmetric: this.symmetric,
        pending: !!this.previews.latest,
      },
    );
  };
  dispose(): void {
    this.operands.dispose();
    this.previews.clear();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
