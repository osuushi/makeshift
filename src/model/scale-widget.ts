import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import {
  type BoxHandle,
  boxEdges,
  boxHandles,
  boxLocal,
  boxWorld,
  type TransformBox,
} from "./transform-box.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./scale.css";

export class ScaleWidget {
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly card = document.createElement("div");
  readonly factors = [0, 1, 2].map(() => document.createElement("input"));
  readonly linked = document.createElement("input");
  readonly accept = document.createElement("button");
  readonly cancel = document.createElement("button");
  readonly handles = document.createElement("div");
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private buttons = new Map<string, HTMLButtonElement>();
  private geometry = new Map<string, BoxHandle>();
  onstart: (event: PointerEvent, handle: BoxHandle) => void = () => {};
  constructor(overlay: HTMLElement) {
    this.root.className = "scale-widget";
    this.root.hidden = true;
    this.card.className = "scale-card";
    this.svg.classList.add("transform-box-lines");
    this.svg.setAttribute("aria-hidden", "true");
    for (const [i, input] of this.factors.entries()) {
      const label = document.createElement("label");
      label.textContent = `${["X", "Y", "Z"][i]} `;
      input.type = "text";
      input.inputMode = "decimal";
      input.value = "1";
      input.setAttribute("aria-label", `Transform scale ${["X", "Y", "Z"][i]}`);
      label.append(input, " ×");
      this.card.append(label);
    }
    const linked = document.createElement("label");
    this.linked.type = "checkbox";
    linked.append(this.linked, "Uniform scale");
    this.accept.textContent = "✓";
    this.accept.setAttribute("aria-label", "Accept transform scale");
    this.cancel.textContent = "×";
    this.cancel.setAttribute("aria-label", "Cancel transform scale");
    const actions = document.createElement("div");
    actions.append(this.accept, this.cancel);
    this.card.append(linked, actions);
    this.root.append(this.svg, this.handles, this.card);
    overlay.append(this.root);
  }
  values(): Vector {
    return this.factors.map((input) => (input.value.trim() ? Number(input.value) : NaN)) as Vector;
  }
  setValues(values: Vector): void {
    this.factors.forEach((input, i) => {
      input.value = String(Number(values[i].toPrecision(10)));
    });
  }
  contains(
    editor: SketchEditor,
    box: TransformBox,
    pivot: Vector,
    factors: Vector,
    x: number,
    y: number,
  ): boolean {
    const local = boxLocal(box, pivot);
    const dimensions = [0, 1, 2].filter((i) => box.max[i] - box.min[i] > 1e-8).length;
    const projected = boxHandles(box)
      .filter((handle) => handle.axes.length === dimensions)
      .map((handle) => {
        const point = handle.point.map((v, i) => local[i] + (v - local[i]) * factors[i]) as Vector;
        return editor.world.project(boxWorld(box, point));
      });
    const cross = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      c: { x: number; y: number },
    ) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const sorted = projected.sort((a, b) => a.x - b.x || a.y - b.y);
    const lower: typeof sorted = [],
      upper: typeof sorted = [];
    for (const p of sorted) {
      while (lower.length > 1 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
        lower.pop();
      lower.push(p);
    }
    for (const p of [...sorted].reverse()) {
      while (upper.length > 1 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
        upper.pop();
      upper.push(p);
    }
    const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
    return (
      hull.length > 2 && hull.every((p, i) => cross(p, hull[(i + 1) % hull.length], { x, y }) >= 0)
    );
  }
  position(
    editor: SketchEditor,
    box: TransformBox,
    pivot: Vector,
    widgetPivot: Vector,
    factors: Vector,
  ): void {
    const bounds = editor.world.canvas.getBoundingClientRect();
    const local = boxLocal(box, pivot);
    const project = (point: Vector) => {
      const scaled = point.map((v, i) => local[i] + (v - local[i]) * factors[i]) as Vector;
      const p = editor.world.project(boxWorld(box, scaled));
      return { x: p.x - bounds.left, y: p.y - bounds.top };
    };
    this.svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
    this.svg.replaceChildren();
    for (const [a, b] of boxEdges(box)) {
      const p = project(a),
        q = project(b);
      const line = document.createElementNS(this.svg.namespaceURI, "line");
      for (const [key, value] of Object.entries({ x1: p.x, y1: p.y, x2: q.x, y2: q.y }))
        line.setAttribute(key, String(value));
      this.svg.append(line);
    }
    this.geometry = new Map(boxHandles(box).map((handle) => [handle.key, handle]));
    this.positionHandles(project, boxLocal(box, widgetPivot));
    const points = [...this.geometry.values()].map((handle) => project(handle.point));
    for (const control of this.root.parentElement?.querySelectorAll(
      ".body-axis-handle, .move-control, .pivot-control, .move-anchor",
    ) ?? []) {
      const rect = control.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      points.push(
        { x: rect.left - bounds.left, y: rect.top - bounds.top },
        { x: rect.right - bounds.left, y: rect.bottom - bounds.top },
      );
    }
    const right = Math.max(...points.map((p) => p.x)),
      left = Math.min(...points.map((p) => p.x));
    const top = Math.min(...points.map((p) => p.y));
    const width = this.card.offsetWidth,
      height = this.card.offsetHeight;
    const x = right + 28 < bounds.width - width ? right + 28 : left - width;
    this.card.style.left = `${Math.min(bounds.width - width - 8, Math.max(8, x))}px`;
    this.card.style.top = `${Math.min(bounds.height - height - 8, Math.max(8, top + 28))}px`;
    const zLabel = this.factors[2].parentElement;
    if (zLabel) zLabel.hidden = !!box.frame;
    this.placement.fit([...this.buttons.values(), this.card]);
  }
  private positionHandles(
    project: (point: Vector) => { x: number; y: number },
    local: Vector,
  ): void {
    const occupied: { x: number; y: number }[] = [];
    for (const [key, button] of this.buttons)
      if (!this.geometry.has(key)) {
        button.remove();
        this.buttons.delete(key);
      }
    for (const handle of this.geometry.values()) {
      let button = this.buttons.get(handle.key);
      if (!button) {
        button = document.createElement("button");
        button.className = "transform-box-handle";
        button.dataset.handle = handle.key;
        const key = handle.key;
        button.addEventListener("pointerdown", (event) => {
          const current = this.geometry.get(key);
          if (current) this.onstart(event, current);
        });
        button.addEventListener("click", (e) => e.stopPropagation());
        this.buttons.set(key, button);
        this.handles.append(button);
      }
      const p = project(handle.point);
      button.hidden =
        handle.axes.every((axis) => Math.abs(handle.point[axis] - local[axis]) < 1e-8) ||
        handle.axes.every((axis) => {
          const point = [...handle.point] as Vector;
          point[axis] += 1;
          const q = project(point);
          return Math.hypot(q.x - p.x, q.y - p.y) < 1e-5;
        }) ||
        occupied.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.1);
      if (!button.hidden) occupied.push(p);
      button.style.left = `${p.x}px`;
      button.style.top = `${p.y}px`;
      button.setAttribute(
        "aria-label",
        `Scale ${handle.axes.map((i) => ["X", "Y", "Z"][i]).join(" ")} ${handle.key}`,
      );
      button.title =
        "Drag to resize · Option: about anchor · Shift: uniform 0.1 steps · click to type";
    }
  }
  update(visible: boolean, active: boolean, valid: boolean, busy: boolean, closing: boolean): void {
    this.root.hidden = !visible;
    this.card.hidden = !active;
    this.accept.hidden = this.cancel.hidden = !active;
    this.accept.disabled = !valid || busy;
    this.root.setAttribute("aria-busy", String(busy));
    this.root.dataset.invalid = String(active && !valid && !busy);
    this.factors.forEach((input) => {
      input.disabled = closing;
    });
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
