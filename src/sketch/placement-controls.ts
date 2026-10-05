import { dragFrame } from "../model/body-drag.js";
import { BodyGizmo } from "../model/body-gizmo.js";
import { BodyPivotDrag } from "../model/body-pivot-drag.js";
import { axes } from "../model/body-placement.js";
import { selectionAnchor } from "../model/selection-anchor.js";
import { widgetPointerOffset } from "../model/widget-viewport.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { copySketch } from "./copy-selection.js";
import { type Sketch, withSketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";
import { modelingSketch } from "./model-selection.js";
import { replayPointerModifiers } from "./modifier-pointer.js";
import type { Vector } from "./planes.js";
import { snapRotation } from "./rotation-snap.js";
import { type PlacementAxis, placedFrame, sketchCenter } from "./sketch-placement.js";

type Session = {
  sketch: Sketch;
  copy: Sketch;
  additional: { sketch: Sketch; copy: Sketch }[];
  duplicate: boolean;
  axis: PlacementAxis;
  rotate: boolean;
  start: { x: number; y: number };
  pivot: Vector;
  frame: ReturnType<typeof dragFrame>;
  pointer: number;
  held: boolean;
  moved: boolean;
  value: number;
  valid: boolean;
  lease: InteractionLease;
};
export class PlacementControls {
  readonly root: HTMLDivElement;
  private input: HTMLInputElement;
  private gizmo: BodyGizmo;
  private anchor: BodyPivotDrag;
  private pivot: Vector | null = null;
  private selected: string | null = null;
  private abort = new AbortController();
  private session: Session | null = null;
  enabled = false;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.gizmo = new BodyGizmo(
      overlay,
      (event, axis, rotate) => this.start(event, axis as PlacementAxis, rotate),
      "sketch",
    );
    this.root = this.gizmo.root;
    this.root.classList.add("sketch-placement-gizmo");
    this.input = this.gizmo.input;
    this.anchor = new BodyPivotDrag(
      editor,
      this.gizmo.pivot,
      () => this.currentPivot(),
      (point) => {
        this.pivot = point;
        editor.refresh();
      },
      () => {
        this.pivot = null;
        editor.refresh();
      },
    );
    this.bindInput();
    editor.world.changed.add(this.update);
    this.update();
  }
  private bindInput(): void {
    const options = { signal: this.abort.signal };
    window.addEventListener("pointermove", this.move, options);
    replayPointerModifiers(this.abort.signal, () => !!this.session?.held, this.move);
    window.addEventListener(
      "pointerup",
      (e) => {
        const s = this.session;
        if (!s || e.pointerId !== s.pointer) return;
        this.move(e);
        s.held = false;
        s.lease.releaseCapture();
        if (s.moved) void this.commit();
        else {
          this.input.focus();
          this.input.select();
        }
      },
      options,
    );
    this.input.addEventListener(
      "input",
      () => this.preview(this.input.value.trim() ? Number(this.input.value) : NaN),
      options,
    );
    onModelKeydown(
      (e) => {
        if (!this.session) return;
        if (e.key === "Escape" || e.key === "Enter") {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (e.key === "Escape") this.cancel();
          else void this.commit();
        }
      },
      { ...options, capture: true },
    );
    window.addEventListener("pointercancel", () => this.cancel(), options);
  }
  private move = (event: PointerEvent): void => {
    const s = this.session;
    if (!s?.held || event.pointerId !== s.pointer) return;
    s.duplicate = event.altKey;
    s.moved ||= Math.hypot(event.clientX - s.start.x, event.clientY - s.start.y) > 3;
    if (!s.moved) return;
    const step = this.editor.world.spacing / (event.shiftKey ? 10 : 1);
    const value = s.rotate
      ? snapRotation(s.frame.angle(event.clientX, event.clientY), event.shiftKey)
      : s.frame.translation(event.clientX, event.clientY);
    this.preview(!s.rotate && this.editor.gridSnap ? Math.round(value / step) * step : value);
  };
  private start(event: PointerEvent, axis: PlacementAxis, rotate: boolean): void {
    const sketches = this.selectedSketches(),
      sketch = sketches[0];
    if (event.button || !sketch || this.session || this.editor.blocked) return;
    event.preventDefault();
    const lease = this.editor.interactions.acquire("placement", () => this.cancel(), undefined, {
      navigation: "when-released",
    });
    if (!lease) return;
    this.session = {
      sketch,
      copy: copySketch(sketch),
      additional: sketches.slice(1).map((sketch) => ({ sketch, copy: copySketch(sketch) })),
      duplicate: event.altKey,
      axis,
      rotate,
      start: { x: event.clientX, y: event.clientY },
      pivot: this.currentPivot(),
      frame: dragFrame(
        this.editor,
        this.currentPivot(),
        axis,
        event.clientX,
        event.clientY,
        undefined,
        widgetPointerOffset(event.currentTarget),
      ),
      pointer: event.pointerId,
      held: true,
      moved: false,
      value: 0,
      valid: true,
      lease,
    };
    const session = this.session;
    lease.trackHistory(
      this.root,
      () => ({ value: session.value, duplicate: session.duplicate }),
      (state) => {
        session.duplicate = state.duplicate;
        this.input.value = String(state.value);
        this.preview(state.value);
      },
    );
    this.input.setAttribute("aria-label", `${rotate ? "Rotation" : "Translation"} ${axis}`);
    this.input.value = "0";
    if (event.pointerId !== -1) lease.capture(event.currentTarget as Element, event.pointerId);
    else {
      this.input.focus();
      this.input.select();
    }
    this.editor.refresh();
  }
  private preview(value: number): void {
    const s = this.session;
    if (s?.lease.phase !== "editing") return;
    try {
      const frame = placedFrame(s.sketch, s.axis, s.rotate, value, s.pivot);
      s.valid = true;
      s.value = value;
      let candidate = withSketch(this.editor.store.data, {
        ...(s.duplicate ? s.copy : s.sketch),
        plane: frame,
      });
      for (const item of s.additional)
        candidate = withSketch(candidate, {
          ...(s.duplicate ? item.copy : item.sketch),
          plane: placedFrame(item.sketch, s.axis, s.rotate, value, s.pivot),
        });
      s.lease.show(candidate);
      if (!numericFocus(this.input)) this.input.value = String(Number(value.toFixed(4)));
      this.editor.message = "";
    } catch (error) {
      s.valid = false;
      this.editor.message = String(error instanceof Error ? error.message : error);
    }
    this.editor.refresh();
  }
  private async commit(): Promise<void> {
    const s = this.session;
    if (!s?.valid || !s.lease.close()) return;
    const before = new Set(this.editor.store.data.sketches.map((sketch) => sketch.id));
    const result = await this.editor.store.request({
      kind: "place-sketch",
      sketchId: s.sketch.id,
      duplicate: s.duplicate,
      frame: placedFrame(s.sketch, s.axis, s.rotate, s.value, s.pivot),
      additional: s.additional.map(({ sketch }) => ({
        sketchId: sketch.id,
        frame: placedFrame(sketch, s.axis, s.rotate, s.value, s.pivot),
      })),
    });
    if (result && s.duplicate) {
      this.editor.modeling.targets = this.editor.store.data.sketches
        .filter((sketch) => !before.has(sketch.id))
        .map((sketch) => ({ kind: "sketch", sketch: sketch.id }));
    }
    if (result && this.pivot && !s.rotate) this.pivot = this.previewPivot();
    this.finish();
  }
  private cancel(): void {
    if (!this.session?.lease.close()) return;
    this.finish();
  }
  private finish(): void {
    const s = this.session;
    this.session = null;
    s?.lease.release();
    this.editor.refresh();
  }
  private selectedSketches(): Sketch[] {
    const single = modelingSketch(this.editor);
    if (single) return [single];
    const targets = this.editor.modeling.targets;
    if (!targets.length || targets.some((t) => t.kind !== "sketch")) return [];
    return targets
      .map((target) => this.editor.store.data.sketches.find((s) => s.id === target.sketch))
      .filter((sketch) => sketch !== undefined);
  }
  private currentPivot(): Vector {
    const sketches = this.selectedSketches();
    return (
      this.pivot ??
      (sketches.length === 1 ? sketchCenter(sketches[0]) : selectionAnchor(this.editor))
    );
  }
  private previewPivot(): Vector {
    const s = this.session;
    if (!s) return this.currentPivot();
    return s.rotate ? s.pivot : (s.pivot.map((v, i) => v + axes[s.axis][i] * s.value) as Vector);
  }
  private update = (): void => {
    const sketches = this.selectedSketches(),
      sketch = sketches[0];
    const key = sketches.map((s) => s.id).join(",") || null;
    if (this.selected !== key) {
      this.selected = key;
      this.pivot = null;
    }
    this.root.hidden = !!this.editor.world.active || !sketch || !this.enabled;
    this.input.hidden = !this.session;
    if (!sketch) return;
    this.gizmo.update(this.editor, this.previewPivot(), false);
    this.input.setAttribute("aria-invalid", String(this.session?.valid === false));
  };
  dispose(): void {
    this.cancel();
    this.abort.abort();
    this.anchor.dispose();
    this.gizmo.dispose();
    this.editor.world.changed.delete(this.update);
  }
}
