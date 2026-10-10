import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Extrusion, LiftSource } from "./body.js";
import { BooleanOperands } from "./boolean-operands.js";
import { ExtrudeInputs } from "./extrude-inputs.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import { ExtrudeTwist } from "./extrude-twist.js";
import { ExtrudeWidget } from "./extrude-widget.js";
import { PreviewRunner } from "./preview-runner.js";

export class ExtrudeControls {
  private operands: BooleanOperands;
  private widget: ExtrudeWidget;
  get root(): HTMLDivElement {
    return this.widget.root;
  }
  private targets: ExtrudeTargets;
  private get input(): HTMLInputElement {
    return this.widget.input;
  }
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private sources: LiftSource[] = [];
  private mode: Extrusion["mode"] = "auto";
  private distance = 0;
  private symmetric = false;
  private previews = new PreviewRunner<Extrusion>({
    editing: () => this.lease?.phase === "editing",
    calculate: (request) => this.calculate(request),
    supersede: () => this.editor.store.supersedePreview(true),
    settled: () => this.editor.refresh(),
  });
  private valid = false;
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
    this.targets = new ExtrudeTargets(editor, () => {
      if (this.mode === "auto") this.mode = editor.store.booleanMode ?? "auto";
      this.queue(this.distance);
    });
    this.widget = new ExtrudeWidget(
      (mode) => {
        if (this.begin()) {
          this.mode = mode;
          this.queue(this.distance);
        }
      },
      () => {
        if (this.begin()) this.queue(this.distance);
        editor.refresh();
      },
      (symmetric) => {
        if (this.begin()) this.queue(this.distance, symmetric);
      },
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.twist = new ExtrudeTwist(
      editor,
      this.root,
      () => this.begin(),
      () => this.lease,
      () => {
        this.queue(this.distance);
        editor.refresh();
      },
      this.abort.signal,
    );
    this.widget.addQuantity(this.twist.row);
    this.root.append(this.targets.root);
    overlay.append(this.root);
    this.inputs = new ExtrudeInputs(
      editor,
      this.widget,
      {
        begin: () => this.begin(),
        lease: () => this.lease,
        active: () => this.active,
        distance: () => this.distance,
        symmetric: () => this.symmetric,
        queue: (value, symmetric) => this.queue(value, symmetric),
        mode: (mode) => {
          this.mode = mode;
          this.queue(this.distance);
          this.lease?.history?.checkpoint();
        },
        finish: () => void this.finish(),
        cancel: () => void this.cancel(),
      },
      this.abort.signal,
    );
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(extrusion: Extrusion): Promise<void> {
    this.editor.modeling.setTool("extrude");
    if (!this.begin(extrusion)) throw new Error("Cannot restore extrusion inputs");
    this.queue(this.distance, this.symmetric);
    await this.previews.settle();
    if (!this.valid) throw new Error("Cannot regenerate the accepted extrusion");
    this.input.focus();
    this.input.select();
  }
  /** Guided tools hand off to the ordinary temporary extrusion interaction. */
  start(
    distance: number,
    symmetric: boolean,
    mode: Extrusion["mode"] = "auto",
    draft?: Extrusion["draft"],
  ): boolean {
    this.editor.modeling.setTool("extrude");
    this.editor.refresh();
    if (!this.begin()) return false;
    this.mode = mode;
    if (draft) this.widget.draft.restore(draft);
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
    this.widget.draft.restore(restored?.draft ?? { mode: "angle", value: 0 });
    this.distance = restored?.distance ?? 0;
    this.symmetric = restored?.symmetric ?? false;
    this.valid = false;
    this.twist.angle = restored?.twist?.angle ?? 0;
    this.twist.origin =
      restored?.twist?.origin ?? (this.widget.axis ? [...this.widget.axis.center] : null);
    this.twist.input.value = String(this.twist.angle);
    this.targets.selected = restored?.targets;
    this.targets.restoredEligible = restored?.eligibleTargets;
    this.input.value = String(this.widget.quantity.display(this.distance));
    this.lease?.trackHistory(
      this.root,
      () => ({
        distance: this.distance,
        quantity: this.widget.quantity.mode,
        symmetric: this.symmetric,
        mode: this.mode,
        draft: this.widget.draft.value,
        angle: this.twist.angle,
        origin: this.twist.origin,
        targets: this.targets.selected,
      }),
      async (state) => {
        this.widget.quantity.setMode(state.quantity);
        this.mode = state.mode;
        this.widget.draft.restore(state.draft);
        this.twist.angle = state.angle;
        this.twist.origin = state.origin;
        this.twist.input.value = String(state.angle);
        this.targets.selected = state.targets;
        this.input.value = String(this.widget.quantity.display(state.distance));
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
      this.valid = false;
      this.previews.clear();
      this.editor.store.supersedePreview(true);
      this.lease?.show(null);
      this.editor.refresh();
      return;
    }
    const request: Extrusion = {
      sources: this.sources,
      distance: value,
      symmetric: this.symmetric,
      draft: this.widget.draft.value,
      twist: this.twist.value,
      mode: this.mode,
      targets: this.targets.selected,
      eligibleTargets: this.targets.eligible,
    };
    // Pointer events within one grid step do not require another calculation.
    if (JSON.stringify(request) === JSON.stringify(this.previews.latest)) return;
    this.distance = value;
    this.valid = false;
    this.previews.enqueue(request);
    this.editor.refresh();
  }
  private async calculate(request: Extrusion): Promise<void> {
    const success = await this.editor.store.request({ kind: "extrude", extrusion: request });
    if (request === this.previews.latest && this.lease?.phase === "editing") {
      this.valid = success;
      this.lease.show(success ? this.editor.store.candidate : null);
      if (success) this.operands.showTool();
    }
    this.editor.refresh();
  }
  async finish(): Promise<boolean> {
    await this.previews.settle();
    if (this.lease && !this.previews.latest && this.distance === 0) {
      await this.cancel();
      return true;
    }
    if (!this.lease || !this.valid || !this.lease.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.lease.release();
    this.lease = null;
    this.input.blur();
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
    this.input.blur();
    this.distance = 0;
    this.symmetric = false;
    this.twist.reset();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease?.candidate) this.operands.clear();
    const editor = this.editor;
    this.widget.update(
      editor,
      this.active,
      this.distance,
      this.mode === "auto" ? editor.store.booleanMode : this.mode,
      this.valid,
      this.twist.value,
      this.symmetric,
    );
    this.twist.update(this.widget.axis, this.active, this.distance, this.valid, this.symmetric);
    this.twist.row.hidden = !!this.widget.axis?.normalExtrusion;
    this.root.dataset.previewPending = String(
      this.active && !!this.previews.latest && !this.valid && this.editor.store.working,
    );
    if (
      (!this.active && editor.modeling.tool !== "extrude") ||
      (editor.interactions.current && editor.interactions.current.kind !== "extrude")
    )
      this.root.hidden = true;
    this.targets.update(
      this.active &&
        (this.mode === "auto" ? editor.store.booleanMode : this.mode) !== "new" &&
        !!editor.store.data.bodies?.length,
    );
    this.widget.fit();
  };
  dispose(): void {
    this.operands.dispose();
    this.previews.clear();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
