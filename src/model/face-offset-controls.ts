import { faceGuidePath, type GuideToolPlan } from "../guides/tool-path.js";
import { guideToolSession } from "../guides/tool-session.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { AxialDrag } from "./axial-drag.js";
import type { BodyFaceOffset } from "./body.js";
import { faceOffsetInputs } from "./face-offset-inputs.js";
import {
  expandFaceTargets,
  type FaceFinish,
  offsetHandle,
  offsetTargets,
  sharedBlend,
} from "./face-offset-targets.js";
import { FaceOffsetWidget } from "./face-offset-widget.js";
import { OffsetPlacement } from "./offset-placement.js";
import { OffsetQuantity } from "./offset-quantity.js";
import { PreviewRunner } from "./preview-runner.js";

export class FaceOffsetControls {
  private widget: FaceOffsetWidget;
  private abort = new AbortController();
  private lease: InteractionLease | null = null;
  private restoredSelection: SketchEditor["modeling"]["targets"] | undefined;
  private faces: BodyFaceOffset["faces"] = [];
  private axis: ReturnType<typeof offsetHandle> | null = null;
  private placement = new OffsetPlacement();
  private quantity = new OffsetQuantity();
  private blend: FaceFinish | null = null;
  private distance = 0;
  private valid = false;
  private invalid = false;
  private previews = new PreviewRunner<BodyFaceOffset>({
    editing: () => this.lease?.phase === "editing",
    calculate: (request) => this.calculate(request),
    supersede: () => this.editor.store.supersedePreview(),
    settled: () => this.editor.refresh(),
  });
  private drag: AxialDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.widget = new FaceOffsetWidget(
      overlay,
      () => void this.finish(),
      () => void this.cancel(),
    );
    this.drag = new AxialDrag(editor, this.widget.handle, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      axis: () => this.axis,
      value: () => this.distance,
      queue: (value) => this.queue(value),
      focus: () => {
        this.widget.input.focus();
        this.widget.input.select();
      },
      modifySelection: true,
      guide: (point) => this.guide(point),
    });
    faceOffsetInputs(editor, this.widget, this.quantity, this.abort.signal, {
      begin: () => this.begin(),
      lease: () => this.lease,
      focus: () => this.focus(),
      queue: (value) => this.queue(value),
      finish: () => void this.finish(),
      cancel: () => void this.cancel(),
    });
    editor.world.changed.add(this.update);
    this.update();
  }
  async reopen(operation: BodyFaceOffset): Promise<void> {
    this.editor.modeling.setTool("offset");
    this.update();
    if (!this.begin(operation)) throw new Error("Cannot restore offset inputs");
    this.queue(operation.distance);
    await this.previews.settle();
    if (!this.valid) throw new Error("Cannot regenerate the accepted face offset");
    this.focus();
  }
  guide(point: Vector): GuideToolPlan | null {
    if (this.editor.world.active || this.editor.modeling.tool !== "offset") return null;
    const selected = offsetTargets(this.editor);
    const path = selected?.faces.map((face) => faceGuidePath(point, face)).find((p) => p);
    if (!path || !selected || sharedBlend(selected.faces)) return null;
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
          valid: () => this.valid && !this.invalid,
          distance: () => this.distance,
          cancel: () => this.cancel(),
        });
      },
    };
  }
  private begin(restored?: BodyFaceOffset): boolean {
    if (this.lease) return this.lease.phase === "editing";
    const selected = offsetTargets(this.editor);
    if (this.editor.blocked || this.editor.world.active || !selected || !this.axis) return false;
    this.lease = this.editor.interactions.acquire(
      "face-offset",
      () => this.cancel(),
      () => this.finish(),
      { navigation: "when-released", settled: () => this.previews.settle() },
    );
    if (!this.lease) return false;
    this.restoredSelection = restored ? structuredClone(this.editor.modeling.targets) : undefined;
    this.blend = sharedBlend(selected.faces);
    this.faces = restored
      ? structuredClone(restored.faces)
      : expandFaceTargets(this.editor, selected.targets, !!this.blend);
    this.editor.modeling.targets = this.faces.map((t) => ({ kind: "face", ...t }));
    this.quantity.configure(selected.faces, this.faces, this.blend);
    this.distance = restored?.distance ?? 0;
    if (restored && !this.blend)
      this.quantity.setMode(restored.radius !== undefined ? "radius" : "offset");
    this.widget.input.value = this.quantity.text(this.distance);
    this.valid = true;
    this.previews.clear();
    this.lease.trackHistory(
      this.widget.root,
      () => ({
        distance: this.distance,
        mode: this.quantity.mode,
      }),
      async (state) => {
        this.quantity.setMode(state.mode);
        this.widget.input.value = this.quantity.text(state.distance);
        this.queue(state.distance);
        await this.previews.settle();
      },
    );
    this.editor.notice = this.quantity.notice;
    this.editor.modeling.hover = null;
    this.editor.bodiesVisible = true;
    this.editor.refresh();
    return true;
  }
  private focus(): void {
    this.editor.refresh();
    this.widget.input.focus();
    this.widget.input.select();
  }
  private queue(distance: number): void {
    distance = this.quantity.clamp(distance);
    if (this.lease?.phase !== "editing" || this.previews.latest?.distance === distance) return;
    this.invalid = !Number.isFinite(distance);
    this.distance = distance;
    this.valid = false;
    if (!Number.isFinite(distance)) {
      this.previews.clear();
      this.lease.show(null);
      this.editor.notice = "Enter a finite face offset";
      this.editor.refresh();
      return;
    }
    this.editor.notice = this.quantity.notice;
    this.previews.enqueue({
      faces: this.faces,
      distance,
      ...this.quantity.finishInput(distance),
    });
    this.editor.refresh();
  }
  private async calculate(request: BodyFaceOffset): Promise<void> {
    const success = await this.editor.store.request({ kind: "offset-faces", operation: request });
    if (this.lease?.phase === "editing" && this.previews.latest) {
      if (success) this.lease.show(this.editor.store.candidate);
      if (request !== this.previews.latest) return;
      if (success) {
        const distance = this.editor.store.offsetDistance ?? request.distance;
        this.invalid = distance !== request.distance;
        if (this.invalid) {
          this.widget.input.blur();
          this.editor.notice = "Offset stopped at the last verified position";
        }
        this.distance = distance;
        this.editor.modeling.targets = (this.editor.store.offsetSelection ?? this.faces).map(
          (face) => ({ kind: "face", ...face }),
        );
      }
      if (!success) this.invalid = true;
      this.valid = success;
      this.lease.show(success ? this.editor.store.candidate : null);
    }
    this.editor.refresh();
  }
  private async finish(): Promise<boolean> {
    await this.previews.settle();
    const lease = this.lease;
    if (this.drag.active || !lease || lease.captured || !this.valid) return false;
    if (Math.abs(this.distance) < 1e-8) {
      await this.cancel();
      return true;
    }
    if (!lease.close()) return false;
    const success = await this.editor.accept();
    if (!success) {
      lease.phase = "editing";
      this.editor.refresh();
      return false;
    }
    if (!this.editor.modeling.targets.length) {
      const ids = new Set(this.faces.map((face) => face.body));
      this.editor.modeling.targets = (this.editor.store.data.bodies ?? [])
        .filter((body) => ids.has(body.id))
        .map((body) => ({ kind: "body", body: body.id }));
    }
    this.end(lease);
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
    this.editor.modeling.targets =
      this.restoredSelection ?? this.faces.map((face) => ({ kind: "face", ...face }));
    this.end(lease);
  }
  private end(lease: InteractionLease): void {
    this.restoredSelection = undefined;
    this.lease = null;
    this.widget.input.blur();
    this.distance = 0;
    this.invalid = false;
    this.editor.notice = "";
    lease.release();
    this.editor.refresh();
  }
  private update = (): void => {
    if (!this.lease) {
      const selected = offsetTargets(this.editor);
      if (
        this.editor.world.active ||
        this.editor.interactions.current ||
        this.editor.modeling.tool !== "offset" ||
        !selected
      ) {
        this.widget.root.hidden = true;
        return;
      }
      this.axis =
        this.placement.choose(selected.faces[0], this.editor.world.camera) ??
        offsetHandle(this.editor, selected.faces[0]);
      this.blend = sharedBlend(selected.faces);
      this.quantity.configure(
        selected.faces,
        expandFaceTargets(this.editor, selected.targets, !!this.blend),
        this.blend,
      );
    }
    if (this.axis)
      this.widget.update(
        this.editor,
        this.axis,
        !!this.lease,
        this.distance,
        this.quantity,
        this.valid,
        this.blend,
        this.invalid,
      );
  };
  dispose(): void {
    this.previews.clear();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    this.widget.dispose();
  }
}
