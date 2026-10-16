import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame } from "../sketch/planes.js";
import { type PlacementAxis, placedFrame } from "../sketch/sketch-placement.js";
import { gizmoPointer } from "./body-drag.js";
import { BodyGizmo } from "./body-gizmo.js";
import { GizmoInputs, type GizmoPointer } from "./gizmo-inputs.js";

/** Plane geometry uses the same press, release and numeric input route as body Move. */
export class PlanePlacement {
  private gizmo: BodyGizmo;
  get root(): HTMLElement {
    return this.gizmo.root;
  }
  private abort = new AbortController();
  private pointer: GizmoPointer | null = null;
  private drag: { frame: PlaneFrame; axis: PlacementAxis; rotate: boolean } | null = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
    private current: () => { frame: PlaneFrame; lease: InteractionLease | null } | null,
    private change: (frame: PlaneFrame | null) => void,
    private begin: () => void = () => {},
    private finish?: () => Promise<boolean>,
  ) {
    this.gizmo = new BodyGizmo(
      overlay,
      (event, axis, rotate) => this.start(event, axis as PlacementAxis, rotate),
      "plane",
    );
    this.gizmo.pivot.disabled = true;
    this.gizmo.pivot.title = "Plane origin";
    new GizmoInputs(editor, this.gizmo.input, this.abort.signal, {
      gesture: () =>
        this.pointer && this.drag ? { pointer: this.pointer, rotate: this.drag.rotate } : null,
      active: () => false, // The construction-plane owner handles acceptance/cancellation keys.
      queue: (value) => this.preview(value),
      release: (moved) => {
        this.pointer = null;
        this.current()?.lease?.releaseCapture();
        if (moved && !this.drag?.rotate && this.finish) void this.finish();
        else if (!moved) {
          this.gizmo.input.focus();
          this.gizmo.input.select();
        } else editor.refresh();
      },
      finish: () => this.finish?.() ?? Promise.resolve(false),
      cancel: () => {
        if (this.pointer) editor.interactions.requestCancel();
      },
    });
  }
  private start(event: PointerEvent, axis: PlacementAxis, rotate: boolean): void {
    if (event.button || this.editor.blocked || this.pointer) return;
    if (!this.current()?.lease) this.begin();
    const current = this.current();
    if (!current?.lease) return;
    event.preventDefault();
    event.stopPropagation();
    this.drag = { frame: structuredClone(current.frame), axis, rotate };
    this.pointer = gizmoPointer(this.editor, current.frame.origin, axis, event);
    this.gizmo.input.value = "0";
    this.gizmo.input.removeAttribute("aria-invalid");
    this.gizmo.input.setAttribute(
      "aria-label",
      `Plane ${rotate ? "rotation" : "translation"} ${axis}`,
    );
    if (event.pointerId !== -1)
      current.lease.capture(event.currentTarget as Element, event.pointerId);
    this.editor.refresh();
    if (event.pointerId === -1) {
      this.gizmo.input.focus();
      this.gizmo.input.select();
    }
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
    this.pointer = this.drag = null;
    this.gizmo.input.removeAttribute("aria-invalid");
  }
  update(): void {
    const current = this.current();
    this.gizmo.root.hidden = !current || !!this.editor.world.active;
    this.gizmo.input.hidden = !this.drag;
    if (current) this.gizmo.update(this.editor, current.frame.origin, false);
  }
  dispose(): void {
    this.abort.abort();
    this.gizmo.dispose();
  }
}
