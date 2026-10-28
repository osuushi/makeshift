import type { Point } from "../sketch/planes.js";
import type { BodyBoolean } from "./body.js";
import { modeIcons } from "./boolean-icons.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./boolean-widget.css";

export class BooleanWidget {
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  private keep = document.createElement("button");
  private apply = document.createElement("button");
  private actions = document.createElement("div");
  private requirement = document.createElement("div");
  constructor(
    overlay: HTMLElement,
    mode: (value: BodyBoolean["mode"]) => void,
    keep: () => void,
    accept: () => void,
    cancel: () => void,
  ) {
    this.root.className = "boolean-widget";
    this.actions.className = "boolean-actions";
    this.root.hidden = true;
    for (const value of ["union", "subtract", "intersect"] as const) {
      const button = document.createElement("button");
      button.dataset.mode = value;
      button.title = `${value[0].toUpperCase()}${value.slice(1)}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = `<svg viewBox="0 0 24 24">${modeIcons[value]}</svg>`;
      button.onclick = () => mode(value);
      this.actions.append(button);
    }
    this.keep.setAttribute("aria-label", "Keep originals");
    this.keep.onclick = keep;
    this.apply.setAttribute("aria-label", "Accept Boolean");
    this.apply.onclick = accept;
    const dismiss = document.createElement("button");
    dismiss.setAttribute("aria-label", "Cancel Boolean");
    dismiss.textContent = "Cancel";
    dismiss.title = "Cancel (Escape)";
    dismiss.onclick = cancel;
    this.requirement.className = "tool-requirement";
    this.requirement.setAttribute("role", "status");
    this.actions.append(this.keep, this.apply, dismiss);
    this.root.append(this.actions, this.requirement);
    overlay.append(this.root);
  }
  update(
    operation: BodyBoolean,
    busy: boolean,
    valid: boolean,
    count: number,
    point: Point,
    requirement: string,
  ): void {
    this.root.hidden = false;
    this.requirement.textContent = requirement;
    this.requirement.hidden = !requirement;
    this.root.setAttribute("aria-busy", String(busy));
    this.keep.setAttribute("aria-pressed", String(operation.keepOriginals));
    this.keep.title =
      operation.mode === "subtract" ? "Keep original cutting tools" : "Keep all original bodies";
    this.keep.textContent =
      operation.mode === "subtract"
        ? operation.keepOriginals
          ? "Keep tools"
          : "Remove tools"
        : operation.keepOriginals
          ? "Keep originals"
          : "Remove originals";
    this.apply.textContent = busy ? "Applying…" : valid && !count ? "Apply empty result" : "Apply";
    this.apply.title = "Apply (Enter)";
    for (const button of this.root.querySelectorAll("button")) {
      button.disabled =
        button.getAttribute("aria-label") === "Cancel Boolean"
          ? false
          : busy || (button === this.apply && !valid);
      if (button.dataset.mode)
        button.setAttribute("aria-pressed", String(button.dataset.mode === operation.mode));
    }
    this.root.style.left = `${point.x}px`;
    this.root.style.top = `${point.y + 90}px`;
    this.placement.fit([this.root]);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
