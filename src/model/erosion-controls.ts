import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Vector } from "../sketch/planes.js";
import { AxialDrag } from "./axial-drag.js";
import type { BodyErosion } from "./body.js";
import { ErosionParameters } from "./erosion-parameters.js";
import { erosionPreview, selectErosionResult } from "./erosion-preview.js";
import { ErosionWidget, erosionAxis } from "./erosion-widget.js";

/** Erode owns a temporary preview; the document changes only on acceptance. */
export class ErosionControls {
  private widget: ErosionWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private ids: string[] = [];
  private original: ModelingTarget[] = [];
  private axis: { center: Vector; normal: Vector } | null = null;
  private parameters = new ErosionParameters();
  private valid = false;
  private invalid = false;
  private count: number | null = null;
  private suggestedAllowance: number | null = null;
  private pending: BodyErosion | null = null;
  private latest: BodyErosion | null = null;
  private running: Promise<void> | null = null;
  private drag: AxialDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new ErosionWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
      () => {
        if (!this.begin()) return;
        this.parameters.keepOriginals = !this.parameters.keepOriginals;
        this.queue(this.parameters.thickness, this.parameters.allowancePercent);
      },
      () => {
        if (this.suggestedAllowance !== null)
          this.queue(this.parameters.thickness, this.suggestedAllowance);
      },
    );
    const options = { signal: this.abort.signal };
    this.parameters.bind(
      this.widget,
      () => this.begin(),
      () => this.queue(this.parameters.thickness, this.parameters.allowancePercent),
      this.abort.signal,
    );
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.axis,
      value: () => (Number.isFinite(this.parameters.thickness) ? this.parameters.thickness : 0),
      queue: (value) => this.queue(Math.max(0.001, value), this.parameters.allowancePercent),
      focus: () => this.focus(),
    });
    this.widget.handle.addEventListener(
      "click",
      (event) => {
        if (event.detail === 0 && this.begin()) this.focus();
      },
      options,
    );
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
  private focus(): void {
    this.widget.thickness.focus();
    this.widget.thickness.select();
  }
  async reopen(operation: BodyErosion): Promise<void> {
    const body = this.editor.store.data.bodies?.find((b) => b.id === operation.ids[0]);
    if (!body) throw new Error("Cannot restore erosion inputs");
    this.axis = erosionAxis(this.editor, body);
    if (!this.begin(operation)) throw new Error("Cannot restore erosion inputs");
    this.editor.modeling.setTool("erode");
    await this.running;
    if (!this.valid) throw new Error("Cannot regenerate the accepted erosion");
    this.focus();
  }
  private begin(restored?: BodyErosion): boolean {
    if (this.lease) return this.lease.phase === "editing";
    const resolved = this.editor.modeling.resolve("erode");
    if (this.editor.blocked || !resolved.available || !this.axis) return false;
    this.original = [...this.editor.modeling.targets];
    this.ids = restored ? [...restored.ids] : resolved.inputs.map((body) => body.id);
    this.lease = this.editor.interactions.acquire(
      "erode",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released" },
    );
    if (!this.lease) return false;
    this.valid = this.invalid = false;
    if (restored) this.parameters.restore(restored);
    else this.parameters.reset();
    this.count = null;
    this.suggestedAllowance = null;
    this.latest = this.pending = null;
    this.lease.trackHistory(
      this.widget.root,
      () => this.parameters.snapshot(),
      async (values) => {
        Object.assign(this.parameters, values);
        for (const [input, value] of [
          [this.widget.thickness, values.thickness],
          [this.widget.allowance, values.allowancePercent],
          [this.widget.maxFaces, values.maxFaces],
        ] as const)
          input.value = String(value);
        this.queue(values.thickness, values.allowancePercent);
        await this.running;
      },
    );
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.editor.notice = "Erode · Erode by · Approximate mesh reconstruction";
    this.queue(this.parameters.thickness, this.parameters.allowancePercent);
    this.editor.refresh();
    return true;
  }
  private queue(thickness: number, allowancePercent: number): void {
    if (this.lease?.phase !== "editing") return;
    this.parameters.thickness = thickness;

    this.parameters.allowancePercent = allowancePercent;
    const operation = this.parameters.operation(this.ids);
    if (JSON.stringify(operation) === JSON.stringify(this.latest)) return;
    this.valid = false;
    this.count = null;
    this.suggestedAllowance = null;
    this.invalid = !Number.isFinite(thickness) || thickness < 0;
    this.latest = this.pending = operation;
    if (this.running) this.editor.store.supersedePreview(true);
    else this.running = this.drain();
    this.editor.refresh();
  }
  private async drain(): Promise<void> {
    while (this.pending && this.lease?.phase === "editing") {
      const request = this.pending;
      this.pending = null;
      const zero = request.thickness === 0;
      const success = await this.editor.store.request(
        zero ? { kind: "discard" } : { kind: "erode", operation: request },
      );
      if (this.lease?.phase === "editing" && request === this.latest) {
        this.valid = success;
        this.invalid = !success;
        const suggested = this.editor.store.erosionAllowance;
        this.suggestedAllowance =
          !success && suggested !== undefined && request.thickness > 0
            ? Math.ceil((suggested / request.thickness) * 10) * 10
            : null;
        this.showPreview(success && !zero);
        if (success) this.editor.notice = "Erode · Enter to accept · Escape to cancel";
      }
      this.editor.refresh();
    }
    this.running = null;
    this.editor.refresh();
  }
  private showPreview(show: boolean): void {
    const candidate = show ? this.editor.store.candidate : null;
    if (!candidate || !this.latest) {
      this.lease?.show(null);
      return;
    }
    const preview = erosionPreview(candidate, this.editor.store.data, this.latest);
    this.count = preview.count;
    this.lease?.show(preview.document);
  }
  private async finish(): Promise<boolean> {
    await this.running;
    const lease = this.lease;
    if (!lease || this.drag.active) return false;
    if (!this.latest || (this.parameters.thickness === 0 && !this.invalid)) {
      await this.cancel();
      return true;
    }
    if (!this.valid || !lease.close()) return false;
    const accepted = new Set(this.editor.store.data.bodies?.map((body) => body.id));
    if (!(await this.editor.accept())) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    selectErosionResult(this.editor, this.latest, this.original, accepted);
    this.end(lease);
    return true;
  }
  private async cancel(): Promise<void> {
    const lease = this.lease;
    if (!lease?.close()) return;
    this.pending = null;
    this.drag.reset();
    lease.releaseCapture();
    lease.show(null);
    await this.editor.store.cancelPreview();
    await this.running;
    this.editor.modeling.targets = this.original;
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.widget.thickness.blur();
    this.widget.allowance.blur();
    this.widget.method.blur();
    this.widget.meshDetail.blur();
    this.widget.maxFaces.blur();
    this.lease = null;
    this.editor.modeling.setTool(null);
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) {
      const resolved = this.editor.modeling.resolve("erode");
      if (
        this.editor.world.active ||
        this.editor.interactions.current ||
        this.editor.modeling.tool !== "erode" ||
        !resolved.available
      ) {
        this.widget.root.hidden = true;
        return;
      }
      this.axis = erosionAxis(this.editor, resolved.inputs[0]);
      this.begin();
    }
    if (!this.axis) {
      this.widget.root.hidden = true;
      return;
    }
    this.widget.update(
      this.editor,
      this.axis,
      this.parameters.snapshot(),
      !!this.lease,
      this.valid,
      !!this.lease && this.invalid,
      this.lease ? this.count : null,
      this.lease ? this.suggestedAllowance : null,
    );
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
