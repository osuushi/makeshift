import * as THREE from "three";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { arrowWidthAxis, markerMarkup, rotationVisible } from "../sketch/move-widget/geometry.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import { installTwistDrag } from "./extrude-twist-drag.js";
import { revolutionPoint } from "./revolve-axis.js";

export type TwistFrame = {
  center: Vector;
  normal: Vector;
  coplanar: boolean;
  circleCenter?: Vector;
};
export class ExtrudeTwist {
  readonly input = document.createElement("input");
  readonly row = document.createElement("label");
  readonly sphere = document.createElement("button");
  readonly handle = document.createElement("button");
  private guide = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  origin: Vector | null = null;
  angle = 0;
  frame: TwistFrame | null = null;
  private selection = "";
  readonly cancelGesture: () => boolean;
  constructor(
    readonly editor: SketchEditor,
    root: HTMLElement,
    readonly begin: () => boolean,
    readonly lease: () => InteractionLease | null,
    readonly changed: () => void,
    signal: AbortSignal,
  ) {
    this.row.className = "extrude-draft";
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Extrusion twist");
    this.input.title = "Total twist in degrees about the source normal";
    this.row.append("Twist ", this.input, "°");
    this.sphere.className = "extrude-axis-sphere";
    this.sphere.setAttribute("aria-label", "Position extrusion axis");
    this.sphere.title = "Drag axis in the source plane · Command bypasses snapping";
    this.handle.className = "extrude-twist-handle orientable-handle";
    this.handle.setAttribute("aria-label", "Drag extrusion twist");
    this.handle.title = "Drag twist · Shift bypasses whole-degree snapping · click to type";
    this.guide.classList.add("extrude-axis-guide");
    root.append(this.guide, this.sphere, this.handle);
    this.input.addEventListener("focus", () => this.begin(), { signal });
    this.input.addEventListener(
      "input",
      () => {
        if (!this.begin()) return;
        this.angle = this.input.value.trim() ? Number(this.input.value) : NaN;
        this.changed();
      },
      { signal },
    );
    this.cancelGesture = installTwistDrag(this, signal);
  }
  reset(): void {
    this.origin = null;
    this.angle = 0;
  }
  get value() {
    return this.angle === 0 || !this.origin || this.invariant
      ? undefined
      : { angle: this.angle, origin: this.origin };
  }
  get invariant(): boolean {
    const center = this.frame?.circleCenter;
    const origin = this.origin;
    return !!center && !!origin && Math.hypot(...center.map((v, i) => v - origin[i])) <= 1e-6;
  }
  update(
    frame: TwistFrame | null,
    active: boolean,
    distance: number,
    valid: boolean,
    symmetric = false,
  ): void {
    const key = JSON.stringify(this.editor.modeling.targets);
    if (!active && this.selection !== key) this.reset();
    this.selection = key;
    this.frame = frame;
    const available = !!frame?.coplanar;
    this.sphere.hidden = this.handle.hidden = !available;
    this.guide.style.display = available ? "" : "none";
    if (available && frame) this.origin ??= [...frame.center];
    this.input.disabled = this.handle.disabled = !available || this.invariant;
    const reason = !available
      ? "Twist needs profiles in one common plane"
      : this.invariant
        ? "Twisting a cylinder around its own axis does not change its shape. Move the axis to enable twist."
        : "";
    this.row.title = reason;
    this.input.title = reason || "Total twist in degrees about the source normal";
    this.handle.title =
      reason || "Drag twist · Shift bypasses whole-degree snapping · click to type";
    if (!frame || !available) return;
    this.position(frame, distance, symmetric);
    const invalid = active && distance !== 0 && !valid && !this.editor.store.working;
    this.handle.dataset.geometryInvalid = String(invalid);
    this.input.setAttribute("aria-invalid", String(invalid));
    if (!numericFocus(this.input))
      this.input.value = Number.isFinite(this.angle)
        ? String(Number(this.angle.toPrecision(4)))
        : "";
  }
  private position(frame: TwistFrame, distance: number, symmetric: boolean): void {
    const origin = this.origin;
    if (!origin) return;
    const safeDistance = (Number.isFinite(distance) ? distance : 0) / (symmetric ? 2 : 1);
    const parent = this.editor.world.project(
      revolutionPoint(
        { origin, direction: frame.normal },
        frame.center,
        (Number.isFinite(this.angle) ? this.angle : 0) / (symmetric ? 2 : 1),
        safeDistance,
      ),
    );
    const start = this.editor.world.project(origin);
    const end = this.editor.world.project(
      origin.map((v, i) => v + frame.normal[i] * safeDistance) as Vector,
    );
    this.sphere.style.left = `${start.x - parent.x}px`;
    this.sphere.style.top = `${start.y - parent.y}px`;
    const camera = this.editor.world.camera;
    const u = arrowWidthAxis(frame.normal);
    const v = new THREE.Vector3(...frame.normal).cross(new THREE.Vector3(...u)).toArray() as Vector;
    // This control has no geometric position: keep it clear of the axis origin.
    this.handle.style.left = `${start.x - parent.x - 72}px`;
    this.handle.style.top = `${start.y - parent.y}px`;
    this.handle.innerHTML = markerMarkup(camera, u, v, true);
    this.handle.hidden = !rotationVisible(camera, frame.normal);
    const guideStart = symmetric
      ? this.editor.world.project(
          origin.map((n, i) => n - frame.normal[i] * safeDistance) as Vector,
        )
      : start;
    this.guide.innerHTML = `<path d="M${guideStart.x - parent.x} ${guideStart.y - parent.y}L${end.x - parent.x} ${end.y - parent.y}"/>`;
  }
}
