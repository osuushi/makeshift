import type { Point } from "../sketch/planes.js";
import type { Body, BodyBoolean } from "./body.js";
import { modeIcons } from "./boolean-icons.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./boolean-widget.css";

export class BooleanWidget {
  readonly collect = document.createElement("button");
  choose: (body: Body) => void = () => {};
  private operands = document.createElement("div");
  private hint = document.createElement("span");
  private choices = new Map<string, HTMLButtonElement>();
  private roles = document.createElement("span");
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  private keep = document.createElement("button");
  private target = document.createElement("button");
  private status = document.createElement("span");
  constructor(
    overlay: HTMLElement,
    mode: (value: BodyBoolean["mode"]) => void,
    keep: () => void,
    target: () => void,
    accept: () => void,
    cancel: () => void,
  ) {
    this.root.className = "boolean-widget";
    this.root.hidden = true;
    for (const value of ["union", "subtract", "intersect"] as const) {
      const button = document.createElement("button");
      button.dataset.mode = value;
      button.title = `${value[0].toUpperCase()}${value.slice(1)}`;
      button.setAttribute("aria-label", button.title);
      button.innerHTML = `<svg viewBox="0 0 24 24">${modeIcons[value]}</svg>`;
      button.onclick = () => mode(value);
      this.root.append(button);
    }
    this.keep.setAttribute("aria-label", "Keep originals");
    this.keep.onclick = keep;
    this.target.setAttribute("aria-label", "Change subtraction target");
    this.target.title = "Cycle the target body; the other selected bodies are cutting tools";
    this.target.onclick = target;
    this.status.className = "boolean-status";
    this.collect.setAttribute("aria-label", "Change Boolean bodies");
    this.operands.className = "boolean-body-choices";
    this.operands.append(this.hint);
    this.roles.className = "boolean-roles";
    this.root.append(this.keep, this.target, this.collect, this.status);
    for (const [name, symbol, action] of [
      ["Accept Boolean", '<path d="m5 12 4 4L20 5"/>', accept],
      ["Cancel Boolean", '<path d="m6 6 12 12M6 18 18 6"/>', cancel],
    ] as const) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", name);
      button.title = name === "Accept Boolean" ? "Accept (Enter)" : "Cancel (Escape)";
      button.innerHTML = `<svg viewBox="0 0 24 24">${symbol}</svg>`;
      button.onclick = action;
      this.root.append(button);
    }
    this.root.append(this.roles, this.operands);
    overlay.append(this.root);
  }
  update(
    operation: BodyBoolean,
    target: string,
    busy: boolean,
    valid: boolean,
    count: number,
    collecting: boolean,
    chosen: Body[],
    available: { body: Body; number: number }[],
    point: Point,
  ) {
    this.root.hidden = false;
    this.keep.setAttribute("aria-pressed", String(operation.keepOriginals));
    this.keep.title =
      operation.mode === "subtract" ? "Keep original cutting tools" : "Keep all original bodies";
    this.target.hidden = operation.mode !== "subtract";
    this.collect.textContent = collecting ? "Done choosing" : "Change bodies";
    this.collect.setAttribute("aria-pressed", String(collecting));
    this.keep.textContent =
      operation.mode === "subtract"
        ? operation.keepOriginals
          ? "Keep tools"
          : "Remove tools"
        : operation.keepOriginals
          ? "Keep originals"
          : "Remove originals";
    this.roles.textContent =
      operation.mode === "subtract"
        ? "Blue target · orange tools · solid result"
        : "Blue inputs · solid result";
    this.updateBodies(operation, chosen, available, collecting, busy);
    this.target.textContent = chosen.length ? `Target: ${target} ↔` : "Target: choose a body";
    this.status.textContent = busy
      ? "Calculating…"
      : chosen.length < 2
        ? operation.mode === "subtract"
          ? "Choose target, then cutting tools"
          : "Choose at least two bodies"
        : !valid
          ? "No valid result"
          : count
            ? `${count} result ${count === 1 ? "body" : "bodies"}`
            : collecting
              ? "Empty result · Done choosing to accept"
              : "Empty result · Enter to accept";
    for (const button of this.root.querySelectorAll("button")) {
      const name = button.getAttribute("aria-label");
      button.disabled =
        name === "Cancel Boolean"
          ? false
          : busy ||
            (name === "Accept Boolean" && (!valid || collecting)) ||
            (button === this.target && chosen.length < 2);
      if (button.dataset.mode)
        button.setAttribute("aria-pressed", String(button.dataset.mode === operation.mode));
    }
    this.root.style.left = `${point.x}px`;
    this.root.style.top = `${point.y + 90}px`;
    this.placement.fit([this.root]);
  }
  private updateBodies(
    operation: BodyBoolean,
    chosen: Body[],
    available: { body: Body; number: number }[],
    collecting: boolean,
    busy: boolean,
  ): void {
    this.operands.hidden = !collecting;
    this.hint.textContent =
      operation.mode === "subtract"
        ? "Blue target · orange cutting tools. Click a chosen body to remove it."
        : "Blue inputs · solid result. Click a chosen body to remove it.";
    for (const [id, button] of this.choices) {
      if (available.some(({ body }) => body.id === id)) continue;
      button.remove();
      this.choices.delete(id);
    }
    for (const { body, number } of available) {
      const order = chosen.findIndex((b) => b.id === body.id);
      let button = this.choices.get(body.id);
      if (!button) {
        button = document.createElement("button");
        this.choices.set(body.id, button);
        this.operands.append(button);
      }
      button.setAttribute("aria-label", `Boolean Body ${number}`);
      button.setAttribute("aria-pressed", String(order >= 0));
      button.dataset.role =
        order < 0 ? "available" : operation.mode === "subtract" && order > 0 ? "tool" : "target";
      button.textContent = `Body ${number}${order < 0 ? "" : operation.mode === "subtract" ? (order === 0 ? " · Target" : " · Tool") : ` · Input ${order + 1}`}`;
      button.disabled = busy;
      button.onclick = () => this.choose(body);
    }
  }
  dispose() {
    this.placement.dispose();
    this.root.remove();
  }
}
