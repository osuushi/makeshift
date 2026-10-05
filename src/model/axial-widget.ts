import type * as THREE from "three";
import type { Point, Vector } from "../sketch/planes.js";
import { directionalOffset, directionalWidget } from "./directional-widget.js";
import { cameraFacingWidth } from "./widget-frame.js";
import "./axial-widget.css";

export function toolAction(label: string, path: string, action: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
  button.onclick = action;
  return button;
}

export function compactCleanup(button: HTMLButtonElement): void {
  button.innerHTML =
    '<svg viewBox="0 0 24 24"><path d="m15 3-5 10M7 12l7 3-2 6H3l4-9Z M7 16l-1 5M10 17l-1 4"/></svg>';
}

export function distanceField(input: HTMLInputElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "axial-distance";
  const unit = document.createElement("span");
  unit.textContent = "mm";
  label.append(input, unit);
  return label;
}

export function updateAxialArrow(
  handle: HTMLButtonElement,
  camera: THREE.Camera,
  normal: Vector,
  shape: "extrude" | "offset" | "fillet" | "shell",
  direction: Point,
  invalid: boolean,
  width: Vector = cameraFacingWidth(camera, normal),
): void {
  handle.classList.add("orientable-handle");
  handle.innerHTML = directionalWidget(camera, normal, shape, width);
  const offset = directionalOffset(camera, normal);
  handle.style.left = `${offset.x}px`;
  handle.style.top = `${offset.y}px`;
  handle.dataset.directionX = String(direction.x);
  handle.dataset.directionY = String(direction.y);
  handle.dataset.geometryInvalid = String(invalid);
}

export function positionAxialPanel(root: HTMLElement, panel: HTMLElement, point: Point): void {
  root.style.left = `${point.x}px`;
  root.style.top = `${point.y}px`;
  const right = innerWidth - 12;
  const left = Math.max(12, Math.min(right - panel.offsetWidth, point.x + 55)) - point.x;
  const top = Math.max(65, Math.min(innerHeight - panel.offsetHeight - 12, point.y + 45)) - point.y;
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  root.style.setProperty("--extrude-options-left", `${left}px`);
  root.style.setProperty("--extrude-targets-top", `${top + panel.offsetHeight + 5}px`);
}
