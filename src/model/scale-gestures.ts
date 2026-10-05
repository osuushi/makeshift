import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { replayPointerModifiers } from "../sketch/modifier-pointer.js";
import type { Vector } from "../sketch/planes.js";
import { anchorSnap } from "./anchor-snapping.js";
import type { ScaleWidget } from "./scale-widget.js";
import { type BoxHandle, boxLocal, boxWorld, type TransformBox } from "./transform-box.js";
import { widgetPointerOffset } from "./widget-viewport.js";

interface State {
  pivot: Vector;
  operationPivot: Vector;
  factors: Vector;
  box: TransformBox;
  lease: InteractionLease;
}
type Drag = State & {
  offset: { x: number; y: number };
  id: number;
  x: number;
  y: number;
  handle: BoxHandle;
  moved: boolean;
  start: Vector;
  directions: { x: number; y: number }[];
};
export class ScaleGestures {
  private abort = new AbortController();
  private drag: Drag | null = null;
  get active(): boolean {
    return !!this.drag;
  }
  constructor(
    private editor: SketchEditor,
    private widget: ScaleWidget,
    private state: () => State | null,
    private change: (factors: Vector, pivot: Vector) => void,
  ) {
    widget.onstart = (event, handle) => this.start(event, handle);
    const options = { signal: this.abort.signal };
    window.addEventListener("pointermove", this.move, options);
    replayPointerModifiers(this.abort.signal, () => !!this.drag, this.move);
    window.addEventListener(
      "pointerup",
      (event) => {
        const drag = this.drag;
        if (!drag || event.pointerId !== drag.id) return;
        this.move(event);
        this.stop();
        this.editor.refresh();
        if (!drag.moved) {
          const input = widget.factors[drag.handle.axes[0]];
          input.focus();
          input.select();
        }
      },
      options,
    );
  }
  private start(event: PointerEvent, handle: BoxHandle): void {
    if (event.button || this.editor.blocked) return;
    const state = this.state();
    if (state?.lease.phase !== "editing") return;
    event.preventDefault();
    event.stopPropagation();
    const pivot = boxLocal(state.box, state.operationPivot);
    const start = handle.point.map(
      (v, i) => pivot[i] + (v - pivot[i]) * state.factors[i],
    ) as Vector;
    const p = this.editor.world.project(boxWorld(state.box, start));
    const directions = [0, 1, 2].map((axis) => {
      const point = [...start] as Vector;
      point[axis] += 1;
      const q = this.editor.world.project(boxWorld(state.box, point));
      return { x: q.x - p.x, y: q.y - p.y };
    });
    this.drag = {
      ...state,
      offset: widgetPointerOffset(event.currentTarget),
      factors: [...state.factors],
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      handle,
      moved: false,
      start,
      directions,
    };
    state.lease.capture(event.currentTarget as Element, event.pointerId);
  }
  private move = (event: PointerEvent): void => {
    const d = this.drag;
    if (!d || event.pointerId !== d.id || d.lease.phase !== "editing") return;
    let dx = event.clientX - d.x,
      dy = event.clientY - d.y;
    d.moved ||= Math.hypot(dx, dy) > 3;
    if (!d.moved) return;
    const centered = boxLocal(d.box, d.pivot);
    const pivot = [...centered] as Vector;
    if (!event.altKey)
      for (let axis = 0; axis < (d.box.frame ? 2 : 3); axis++) {
        if (d.handle.axes.includes(axis))
          pivot[axis] =
            d.handle.point[axis] === d.box.max[axis] ? d.box.min[axis] : d.box.max[axis];
        else if (event.shiftKey || this.widget.linked.checked) pivot[axis] = d.box.min[axis];
      }
    const snap = event.shiftKey
      ? null
      : anchorSnap(this.editor, { x: event.clientX - d.offset.x, y: event.clientY - d.offset.y });
    if (snap) {
      const p = this.editor.world.project(boxWorld(d.box, d.start)),
        q = this.editor.world.project(snap);
      dx = q.x - p.x;
      dy = q.y - p.y;
    }
    const axes = d.handle.axes.filter((i) => Math.abs(d.handle.point[i] - pivot[i]) > 1e-8);
    const values = [...d.factors] as Vector;
    if (event.shiftKey || this.widget.linked.checked) {
      const p = this.editor.world.project(boxWorld(d.box, pivot)),
        q = this.editor.world.project(boxWorld(d.box, d.start));
      const x = q.x - p.x,
        y = q.y - p.y,
        length = x * x + y * y;
      if (length < 1) return;
      let ratio = 1 + (dx * x + dy * y) / length;
      const reference = d.factors[d.handle.axes[0]];
      if (event.shiftKey && reference > 0)
        ratio = Math.round(reference * ratio * 10) / 10 / reference;
      for (let i = 0; i < (d.box.frame ? 2 : 3); i++) values[i] *= ratio;
    } else {
      const delta = projectedDelta(d.directions, axes, dx, dy);
      for (const i of axes) {
        let destination = d.start[i] + delta[i];
        if (this.editor.gridSnap && !snap)
          destination =
            Math.round(destination / this.editor.world.spacing) * this.editor.world.spacing;
        values[i] = d.factors[i] + (destination - d.start[i]) / (d.handle.point[i] - pivot[i]);
      }
    }
    this.change(values, boxWorld(d.box, pivot));
  };
  stop(): void {
    this.drag?.lease.releaseCapture();
    this.drag = null;
  }
  dispose(): void {
    this.stop();
    this.abort.abort();
  }
}

/** Screen-space least squares, retaining unobservable components in end-on views. */
function projectedDelta(
  directions: { x: number; y: number }[],
  axes: number[],
  dx: number,
  dy: number,
): Vector {
  const result: Vector = [0, 0, 0];
  if (axes.length === 1) {
    const i = axes[0],
      p = directions[i],
      norm = p.x ** 2 + p.y ** 2;
    if (norm > 1e-12) result[i] = (dx * p.x + dy * p.y) / norm;
    return result;
  }
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const i of axes) {
    const p = directions[i];
    xx += p.x ** 2;
    xy += p.x * p.y;
    yy += p.y ** 2;
  }
  const determinant = xx * yy - xy * xy;
  if (determinant > 1e-12 * (xx + yy) ** 2) {
    const x = (yy * dx - xy * dy) / determinant,
      y = (xx * dy - xy * dx) / determinant;
    for (const i of axes) result[i] = directions[i].x * x + directions[i].y * y;
  } else if (xx + yy > 1e-12) {
    for (const i of axes) result[i] = (directions[i].x * dx + directions[i].y * dy) / (xx + yy);
  }
  return result;
}
