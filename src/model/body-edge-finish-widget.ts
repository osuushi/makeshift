import { numericFocus } from "../tools/menu-focus.js";
import { directionalOffset, directionalWidget } from "./directional-widget.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./body-edge-finish-widget.css";
import type { Point } from "../sketch/planes.js";
import type { World } from "../sketch/world.js";
import type { BodyEdgeFinish } from "./body.js";
import { type EdgeFinishFrame, edgeViewportDirection } from "./edge-finish-direction.js";

interface EdgeFinishInput {
  begin: () => void;
  activate: (mode: BodyEdgeFinish["mode"]) => void;
  chooseMode: (mode: BodyEdgeFinish["mode"]) => void;
  size: (value: number) => void;
}

export class BodyEdgeFinishWidget {
  direction: Point | null = null;
  private panel = document.createElement("div");
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly handles = {
    fillet: document.createElement("button"),
    chamfer: document.createElement("button"),
  };
  readonly input = document.createElement("input");
  readonly modeButtons = {
    fillet: document.createElement("button"),
    chamfer: document.createElement("button"),
  };
  private field = document.createElement("label");
  private options = document.createElement("div");
  private dismiss = document.createElement("button");
  private accept = document.createElement("button");
  constructor(overlay: HTMLElement, finish: () => void, cancel: () => void) {
    this.root.className = "body-edge-finish-widget";
    for (const mode of ["fillet", "chamfer"] as const) {
      const handle = this.handles[mode],
        name = mode === "fillet" ? "Fillet" : "Chamfer";
      handle.title = `${name} edges · drag with the surface to increase size, or click to type`;
      handle.setAttribute("aria-label", `${name} edges`);
      handle.className = "edge-size-handle orientable-handle";
      const corner = mode === "fillet" ? "M3 21V11a8 8 0 0 1 8-8h10" : "M3 21V13L13 3h8";
      // Keep the pressed SVG connected through preview and focus refreshes.
      this.modeButtons[mode].innerHTML =
        `<svg viewBox="0 0 24 24"><path d="${corner}"/><path d="M3 13V3h10" stroke-dasharray="2 2" opacity=".35"/></svg>`;
    }
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Fillet radius");
    this.input.title = "Shared fillet radius (mm)";
    const unit = document.createElement("span");
    unit.textContent = "mm";
    const field = this.field;
    field.append(this.input, unit);
    const dismiss = this.dismiss;
    for (const [button, label, path, action] of [
      [this.accept, "Accept fillet", "m5 12 4 4L19 6", finish],
      [dismiss, "Cancel fillet", "m6 6 12 12M6 18 18 6", cancel],
    ] as const) {
      button.title = label;
      button.setAttribute("aria-label", label);
      button.innerHTML = `<svg viewBox="0 0 24 24"><path d="${path}"/></svg>`;
      button.onclick = action;
    }
    this.options.append(this.modeButtons.fillet, this.modeButtons.chamfer, this.accept, dismiss);
    this.panel.className = "edge-finish-panel";
    this.panel.append(field, this.options);
    this.root.append(this.handles.fillet, this.handles.chamfer, this.panel);
    overlay.append(this.root);
    this.root.hidden = true;
  }
  bind(signal: AbortSignal, input: EdgeFinishInput): void {
    const options = { signal };
    for (const mode of ["fillet", "chamfer"] as const) {
      this.modeButtons[mode].addEventListener("click", () => input.chooseMode(mode), options);
      this.handles[mode].addEventListener(
        "click",
        (event) => {
          if (event.detail === 0) input.activate(mode);
        },
        options,
      );
    }
    this.input.addEventListener("focus", input.begin, options);
    this.input.addEventListener(
      "input",
      () => input.size(this.input.value.trim() ? Number(this.input.value) : NaN),
      options,
    );
  }
  update(
    world: World,
    frame: EdgeFinishFrame,
    mode: BodyEdgeFinish["mode"],
    active: boolean,
    size: number,
    valid: boolean,
    busy: boolean,
    invalid: boolean,
  ) {
    const { camera } = world;
    const { outward, width } = frame;
    const point = world.project(frame.anchor);
    const direction = frame.motion
      ? edgeViewportDirection(frame.anchor, frame.motion, (point) => world.project(point))
      : null;
    const name = mode === "chamfer" ? "Chamfer" : "Fillet";
    const quantity = mode === "chamfer" ? "distance" : "radius";
    for (const kind of ["fillet", "chamfer"] as const) this.handles[kind].hidden = kind !== mode;
    this.direction = direction;
    const handle = this.handles[mode];
    handle.title = direction
      ? `${name} edges · drag with the surface to increase size, or click to type`
      : `${name} edges · click to type, or orbit to reveal the drag direction`;
    handle.innerHTML = directionalWidget(camera, outward, mode ?? "fillet", width);
    const offset = directionalOffset(camera, outward);
    handle.style.left = `${offset.x}px`;
    handle.style.top = `${offset.y}px`;
    handle.dataset.directionX = String(direction?.x ?? 0);
    handle.dataset.directionY = String(direction?.y ?? 0);
    for (const kind of ["fillet", "chamfer"] as const) {
      const button = this.modeButtons[kind];
      button.title = kind === mode ? `${name} selected · click to edit size` : `Switch to ${kind}`;
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(kind === mode));
      button.disabled = busy;
    }
    this.handles[mode].dataset.geometryInvalid = String(invalid);
    this.input.setAttribute("aria-label", `${name} ${quantity}`);
    this.input.title =
      mode === "chamfer"
        ? "Equal setback on both adjacent faces (mm)"
        : "Shared fillet radius (mm)";
    for (const [button, verb] of [
      [this.accept, "Accept"],
      [this.dismiss, "Cancel"],
    ] as const) {
      button.title = `${verb} ${mode ?? "fillet"}`;
      button.setAttribute("aria-label", button.title);
    }
    this.root.hidden = false;
    this.dismiss.disabled = !active || busy;
    this.root.style.left = `${point.x}px`;
    this.root.style.top = `${point.y}px`;
    this.panel.style.left = `${Math.max(12, Math.min(innerWidth - 170 - this.panel.offsetWidth, point.x + 55)) - point.x}px`;
    this.panel.style.top = `${Math.max(65, Math.min(innerHeight - this.panel.offsetHeight - 12, point.y + 45)) - point.y}px`;
    this.accept.disabled = !active || !valid || size === 0 || busy;
    this.input.setAttribute("aria-invalid", String(active && invalid && !valid && !busy));
    if (!numericFocus(this.input))
      this.input.value = Number.isFinite(size) ? String(Number(size.toPrecision(4))) : "";
    this.placement.fit([this.handles[mode], this.panel]);
  }
  dispose() {
    this.placement.dispose();
    this.root.remove();
  }
}
