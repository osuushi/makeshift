import { numericFocus } from "../tools/menu-focus.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./revolve.css";
import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { arrowWidthAxis, markerMarkup, rotationVisible } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import type { LiftSource, Revolution } from "./body.js";
import { modeIcons } from "./boolean-icons.js";
import { directionalOffset, directionalWidget } from "./directional-widget.js";
import { projectedAxis } from "./extrude-axis.js";
import { type RevolveAxis, revolutionPoint } from "./revolve-axis.js";
import { revolveSections } from "./revolve-sections.js";

const svgNS = "http://www.w3.org/2000/svg";
export class RevolveWidget {
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly entry = this.button("Revolve", '<path d="M19 12a7 7 0 1 1-2-5M19 3v5h-5M12 3v18"/>');
  readonly angleHandle = this.button(
    "Drag revolution angle",
    '<path d="M19 12a7 7 0 1 1-2-5M19 3v5h-5"/>',
  );
  readonly heightHandle = this.button(
    "Drag revolution height",
    '<path d="M12 3v18m-5-5 5 5 5-5M7 8l5-5 5 5"/>',
  );
  readonly angle = this.input("Revolution angle", "°");
  readonly height = this.input("Revolution height", "mm total");
  readonly axis = this.button("Change revolution axis", '<path d="m4 20 16-16m-7 0h7v7"/>');
  readonly accept = this.button("Accept revolution", '<path d="m4 12 5 5 11-11"/>');
  readonly options = document.createElement("div");
  private drawing = document.createElementNS(svgNS, "svg");
  constructor(setMode: (mode: Revolution["mode"]) => void) {
    this.root.className = "revolve-controls";
    this.angleHandle.className = "revolve-spatial orientable-handle";
    this.heightHandle.className = "revolve-spatial orientable-handle";
    this.drawing.classList.add("revolve-guides");
    this.options.className = "revolve-options";
    for (const mode of ["union", "subtract", "intersect", "new"] as const) {
      const button = this.button(
        mode === "new" ? "New body" : mode[0].toUpperCase() + mode.slice(1),
        modeIcons[mode],
      );
      button.dataset.mode = mode;
      button.title += ` (${{ union: "U", subtract: "S", intersect: "I", new: "N" }[mode]})`;
      button.onclick = () => setMode(mode);
      this.options.append(button);
    }
    this.options.append(this.axis, this.accept);
    this.root.append(
      this.drawing,
      this.entry,
      this.angleHandle,
      this.heightHandle,
      this.angle.parentElement as HTMLElement,
      this.height.parentElement as HTMLElement,
      this.options,
    );
  }
  private button(label: string, path: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${path}</svg>`;
    return button;
  }
  private input(label: string, unit: string): HTMLInputElement {
    const wrapper = document.createElement("label"),
      input = document.createElement("input");
    wrapper.className = "revolve-quantity";
    input.setAttribute("aria-label", label);
    input.inputMode = "decimal";
    input.type = "text";
    input.title = label;
    wrapper.append(input, document.createTextNode(unit));
    return input;
  }
  private place(element: HTMLElement, x: number, y: number): void {
    element.style.left = `${Math.max(35, Math.min(innerWidth - 170, x))}px`;
    element.style.top = `${Math.max(65, Math.min(innerHeight - 95, y))}px`;
  }
  update(
    editor: SketchEditor,
    center: Vector | null,
    active: boolean,
    picking: boolean,
    axis: RevolveAxis | null,
    angle: number,
    height: number,
    mode: Revolution["mode"] | undefined,
    valid: boolean,
    sources: LiftSource[],
  ): void {
    this.root.hidden =
      !center || !!editor.world.active || (!!editor.interactions.current && !active);
    if (!center) return;
    this.entry.hidden = active;
    const start = editor.world.project(center);
    this.place(this.entry, start.x - 70, start.y - 35);
    const editing = active && !picking && !!axis;
    for (const element of [
      this.angleHandle,
      this.heightHandle,
      this.angle.parentElement,
      this.height.parentElement,
      this.options,
    ])
      (element as HTMLElement).hidden = !editing;
    this.drawing.replaceChildren();
    if (!active || !axis) {
      this.placement.fit([this.entry]);
      return;
    }
    this.line(
      editor,
      [-1, 1].map(
        (sign) =>
          axis.origin.map(
            (v, i) => v + sign * axis.direction[i] * editor.world.height * 8,
          ) as Vector,
      ),
      "axis",
    );
    this.direction(editor, axis, center);
    if (!editing) return;
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const safeHeight = Number.isFinite(height) ? height : 0;
    for (const loop of revolveSections(editor, sources, axis, safeAngle, safeHeight))
      this.line(editor, loop, "section");
    const end = revolutionPoint(axis, center, safeAngle, safeHeight);
    // A single turn is enough for the angle guide; height is represented by its own arrow.
    const points = Array.from({ length: 73 }, (_, i) =>
      revolutionPoint(axis, center, i * 5, safeHeight),
    );
    this.line(editor, points, "ring");
    this.line(editor, [center, revolutionPoint(axis, center, 0, safeHeight)], "travel");
    this.placeQuantities(editor, axis, end);
    if (!numericFocus(this.angle)) this.angle.value = String(Math.round(angle * 1000) / 1000);
    if (!numericFocus(this.height)) this.height.value = String(Math.round(height * 1000) / 1000);
    this.angleHandle.title =
      "Drag angle around the ring. Shift bypasses whole-degree snapping; orbit or type when edge-on";
    this.heightHandle.title =
      "Drag total axial height; click to type. Zero gives a normal revolution";
    this.angle.setAttribute("aria-invalid", String(!valid && !editor.blocked));
    for (const handle of [this.angleHandle, this.heightHandle])
      handle.dataset.geometryInvalid = String(!valid && !editor.blocked);
    this.height.setAttribute("aria-invalid", String(!valid && !editor.blocked));
    this.accept.disabled = !valid || editor.blocked;
    for (const button of this.options.querySelectorAll<HTMLButtonElement>("[data-mode]"))
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  private placeQuantities(editor: SketchEditor, axis: RevolveAxis, end: Vector): void {
    const p = editor.world.project(end);
    const camera = editor.world.camera;
    const u = arrowWidthAxis(axis.direction);
    const v = new THREE.Vector3(...axis.direction)
      .cross(new THREE.Vector3(...u))
      .toArray() as Vector;
    this.angleHandle.innerHTML = markerMarkup(camera, u, v, true);
    this.angleHandle.hidden = !rotationVisible(camera, axis.direction);
    this.angleHandle.style.left = `${p.x}px`;
    this.angleHandle.style.top = `${p.y}px`;
    this.place(this.angle.parentElement as HTMLElement, p.x + 50, p.y - 10);
    const direction = projectedAxis(editor, end, axis.direction);
    const offset = directionalOffset(camera, axis.direction, 80);
    this.heightHandle.innerHTML = directionalWidget(camera, axis.direction, "height");
    this.heightHandle.style.left = `${p.x + offset.x}px`;
    this.heightHandle.style.top = `${p.y + offset.y}px`;
    this.place(
      this.height.parentElement as HTMLElement,
      p.x + direction.x * 80 + 45,
      p.y + direction.y * 80 + 10,
    );
    this.place(this.options, p.x, p.y + 70);
    this.placement.fit([
      this.angleHandle,
      this.heightHandle,
      this.angle.parentElement as HTMLElement,
      this.height.parentElement as HTMLElement,
      this.options,
    ]);
  }
  private direction(editor: SketchEditor, axis: RevolveAxis, center: Vector): void {
    const n = axis.direction;
    const along = center.reduce((sum, v, i) => sum + (v - axis.origin[i]) * n[i], 0);
    const a = editor.world.project(axis.origin.map((v, i) => v + along * n[i]) as Vector);
    const b = editor.world.project(
      axis.origin.map((v, i) => v + (along + editor.world.height * 0.14) * n[i]) as Vector,
    );
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 5) return;
    const dx = (b.x - a.x) / length,
      dy = (b.y - a.y) / length;
    const arrow = document.createElementNS(svgNS, "polyline");
    arrow.setAttribute(
      "points",
      `${b.x - 10 * dx + 5 * dy},${b.y - 10 * dy - 5 * dx} ${b.x},${b.y} ${b.x - 10 * dx - 5 * dy},${b.y - 10 * dy + 5 * dx}`,
    );
    arrow.dataset.kind = "direction";
    this.drawing.append(arrow);
  }
  private line(editor: SketchEditor, points: Vector[], kind: string): void {
    const line = document.createElementNS(svgNS, "polyline");
    line.setAttribute(
      "points",
      points
        .map((point) => {
          const p = editor.world.project(point);
          return `${p.x},${p.y}`;
        })
        .join(" "),
    );
    line.dataset.kind = kind;
    this.drawing.append(line);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
