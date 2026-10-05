import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { snapRotation } from "../sketch/rotation-snap.js";
import { type PlacementAxis, placedFrame } from "../sketch/sketch-placement.js";
import { dragFrame } from "./body-drag.js";
import { BodyGizmo } from "./body-gizmo.js";
import { widgetPointerOffset } from "./widget-viewport.js";

export class PlanePlacement {
  private gizmo: BodyGizmo;
  get root(): HTMLElement {
    return this.gizmo.root;
  }
  private abort = new AbortController();
  private drag: {
    frame: PlaneFrame;
    axis: PlacementAxis;
    rotate: boolean;
    pointer: number;
    held: boolean;
    measurement: ReturnType<typeof dragFrame>;
  } | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private current: () => { frame: PlaneFrame; lease: InteractionLease } | null,
    private change: (frame: PlaneFrame | null) => void,
  ) {
    this.gizmo = new BodyGizmo(
      overlay,
      (event, axis, rotate) => this.start(event, axis as PlacementAxis, rotate),
      "plane",
    );
    this.gizmo.pivot.disabled = true;
    this.gizmo.pivot.title = "Plane origin";
    this.gizmo.input.setAttribute("aria-label", "Plane placement value");
    const options = { signal: this.abort.signal };
    const move = (event: PointerEvent) => {
      const d = this.drag;
      if (!d?.held || d.pointer !== event.pointerId) return;
      const step = editor.world.spacing / (event.shiftKey ? 10 : 1);
      let value = d.rotate
        ? snapRotation(d.measurement.angle(event.clientX, event.clientY), event.shiftKey)
        : d.measurement.translation(event.clientX, event.clientY);
      if (!d.rotate && editor.gridSnap) value = Math.round(value / step) * step;
      this.gizmo.input.value = String(Number(value.toFixed(4)));
      this.preview(value);
    };
    window.addEventListener("pointermove", move, options);
    replayPointerModifiers(this.abort.signal, () => !!this.drag?.held, move);
    window.addEventListener(
      "pointerup",
      (event) => {
        if (this.drag?.pointer !== event.pointerId) return;
        this.drag.held = false;
        this.current()?.lease.releaseCapture();
        this.gizmo.input.focus();
        this.gizmo.input.select();
        this.editor.refresh();
      },
      options,
    );
    this.gizmo.input.addEventListener(
      "input",
      () => this.preview(this.gizmo.input.value.trim() ? Number(this.gizmo.input.value) : NaN),
      options,
    );
  }
  private start(event: PointerEvent, axis: PlacementAxis, rotate: boolean): void {
    const current = this.current();
    if (event.button || !current || this.editor.blocked) return;
    event.preventDefault();
    event.stopPropagation();
    const frame = structuredClone(current.frame);
    this.drag = {
      frame,
      axis,
      rotate,
      pointer: event.pointerId,
      held: true,
      measurement: dragFrame(
        this.editor,
        frame.origin,
        axis,
        event.clientX,
        event.clientY,
        undefined,
        widgetPointerOffset(event.currentTarget),
      ),
    };
    this.gizmo.input.value = "0";
    this.gizmo.input.removeAttribute("aria-invalid");
    this.gizmo.input.setAttribute(
      "aria-label",
      `Plane ${rotate ? "rotation" : "translation"} ${axis}`,
    );
    current.lease.capture(event.currentTarget as Element, event.pointerId);
    this.editor.refresh();
  }
  private preview(value: number): void {
    const d = this.drag;
    if (!d) return;
    this.gizmo.input.setAttribute("aria-invalid", String(!Number.isFinite(value)));
    if (!Number.isFinite(value)) {
      this.editor.message = "Enter a finite plane placement";
      this.change(null);
      return;
    }
    const sketch = { id: "", plane: d.frame, curves: [], constraints: [], groups: [] };
    this.change(placedFrame(sketch, d.axis, d.rotate, value, d.frame.origin));
  }
  reset(): void {
    this.drag = null;
    this.gizmo.input.removeAttribute("aria-invalid");
  }
  update(): void {
    const current = this.current();
    this.gizmo.root.hidden = !current;
    this.gizmo.input.hidden = !this.drag;
    if (current) this.gizmo.update(this.editor, current.frame.origin, false);
  }
  dispose(): void {
    this.abort.abort();
    this.gizmo.dispose();
  }
}
