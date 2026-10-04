import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { AxialDrag } from "./axial-drag.js";
import type { Extrusion, LiftSource } from "./body.js";
import { CleanupAvailability } from "./cleanup-availability.js";
import { extrudeKeys } from "./extrude-keys.js";
import { ExtrudeTargets } from "./extrude-targets.js";
import { ExtrudeTwist } from "./extrude-twist.js";
import { ExtrudeWidget } from "./extrude-widget.js";
import { PreviewRunner } from "./preview-runner.js";

export class ExtrudeControls {
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
    settled: (calculated) => this.previewSettled(calculated),
  });
  private valid = false;
  private drag: AxialDrag;
  private cleanup: CleanupAvailability;
  private twist: ExtrudeTwist;
  get active(): boolean {
    return !!this.lease;
  }
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
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
    this.cleanup = new CleanupAvailability(this.widget.cleanup, () => {
      if (this.previews.latest && this.valid) this.previews.check(() => this.checkCleanup());
    });
    this.widget.cleanup.onclick = () => void this.finish(true);
    this.root.append(this.targets.root);
    overlay.append(this.root);
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.widget.axis,
      value: () => this.distance,
      queue: (value, symmetric) => this.queue(value, symmetric),
      symmetric: () => this.symmetric,
      focus: () => {
        this.widget.input.focus();
        this.widget.input.select();
      },
      modifySelection: true,
    });
    this.installInputs();
    editor.world.changed.add(this.update);
    this.update();
  }
  private installInputs(): void {
    const editor = this.editor;
    const options = { signal: this.abort.signal };
    this.widget.handle.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0 && this.begin()) {
          editor.refresh();
          this.input.focus();
          this.input.select();
        }
      },
      options,
    );
    this.input.addEventListener("focus", () => this.begin(), options);
    this.widget.draft.root.addEventListener("focusin", () => this.begin(), options);
    this.input.addEventListener(
      "input",
      () => {
        if (this.begin()) this.queue(this.input.value.trim() ? Number(this.input.value) : NaN);
      },
      options,
    );
    extrudeKeys(
      editor,
      this.root,
      {
        active: () => this.active,
        cancel: () => void this.cancel(),
        finish: () => void this.finish(),
        mode: (mode) => {
          this.mode = mode;
          this.queue(this.distance);
          this.lease?.history?.checkpoint();
        },
      },
      this.abort.signal,
    );
  }
  private begin(): boolean {
    if (this.lease) return this.lease.phase === "editing";
    if (this.editor.blocked || this.editor.world.active || this.editor.modeling.tool !== "extrude")
      return false;
    const resolution = this.editor.modeling.resolve("extrude");
    if (!resolution.available) return false;
    this.sources = resolution.inputs;
    if (!this.sources.length) return false;
    this.lease = this.editor.interactions.acquire(
      "extrude",
      () => (this.twist.cancelGesture() ? undefined : this.cancel()),
      () => this.finish(),
      { navigation: "when-released" },
    );
    this.previews.clear();
    this.targets.reset();
    this.mode = "auto";
    this.widget.draft.reset();
    this.distance = 0;
    this.symmetric = false;
    this.valid = false;
    this.twist.origin ??= this.widget.axis ? [...this.widget.axis.center] : null;
    this.lease?.trackHistory(
      this.root,
      () => ({
        distance: this.distance,
        symmetric: this.symmetric,
        mode: this.mode,
        draft: this.widget.draft.value,
        angle: this.twist.angle,
        origin: this.twist.origin,
        targets: this.targets.selected,
      }),
      async (state) => {
        this.mode = state.mode;
        this.widget.draft.restore(state.draft);
        this.twist.angle = state.angle;
        this.twist.origin = state.origin;
        this.twist.input.value = String(state.angle);
        this.targets.selected = state.targets;
        this.input.value = String(state.distance);
        this.queue(state.distance, state.symmetric);
        await this.previews.settle();
      },
    );
    return !!this.lease;
  }
  private queue(value: number, symmetric = this.symmetric): void {
    this.symmetric = symmetric;
    if (
      !Number.isFinite(value) ||
      Math.abs(value) < 1e-8 ||
      !Number.isFinite(this.widget.draft.value.value) ||
      !Number.isFinite(this.twist.value?.angle ?? 0)
    ) {
      this.cleanup.reset();
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
    this.cleanup.reset(Number.isFinite(value) && value !== 0);
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
    }
    this.editor.refresh();
  }
  private previewSettled(calculated: boolean): void {
    if (calculated) {
      if (this.valid && this.distance !== 0 && this.lease?.phase === "editing")
        this.cleanup.schedule();
      else this.cleanup.reset();
    }
    this.editor.refresh();
  }
  private async checkCleanup(): Promise<void> {
    const request = this.previews.latest;
    if (!request || !this.valid || this.lease?.phase !== "editing") return;
    const success = await this.editor.store.request({ kind: "check-cleanup" });
    if (request === this.previews.latest && this.valid && this.lease?.phase === "editing")
      this.cleanup.resolve(this.editor.store.cleanupAvailable, success);
    this.editor.refresh();
  }
  async finish(cleanup = false): Promise<boolean> {
    await this.previews.settle();
    if (this.lease && !this.previews.latest && this.distance === 0) {
      await this.cancel();
      return true;
    }
    if (!this.lease || !this.valid || !this.lease.close()) return false;
    const success = await this.editor.accept(cleanup);
    if (!success) {
      if (this.lease) this.lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    this.editor.visibility.setUsedSketchesVisible(this.editor.store.data, this.sources, false);
    this.lease.release();
    this.lease = null;
    this.input.blur();
    this.cleanup.reset();
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
    this.drag.reset();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.previews.settle();
    lease.release();
    this.lease = null;
    this.input.blur();
    this.cleanup.reset();
    this.distance = 0;
    this.symmetric = false;
    this.twist.reset();
    this.editor.refresh();
  }
  private update = (): void => {
    this.cleanup.update(!!this.lease && this.distance !== 0, this.editor.blocked || !this.valid);
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
  };
  dispose(): void {
    this.previews.clear();
    this.cleanup.reset();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.root.remove();
  }
}
