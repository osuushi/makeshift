import type { Point } from "../sketch/planes.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./plane-cut-widget.css";

export class PlaneCutWidget {
  readonly root = document.createElement("div");
  private title = document.createElement("strong");
  private status = document.createElement("span");
  private apply = document.createElement("button");
  private placement = new WidgetClearance(this.root);
  constructor(overlay: HTMLElement, accept: () => void, cancel: () => void) {
    this.root.className = "plane-cut-widget";
    this.root.hidden = true;
    this.status.className = "plane-cut-status";
    this.status.setAttribute("aria-live", "polite");
    this.apply.onclick = accept;
    this.apply.textContent = "Apply";
    this.apply.title = "Apply (Enter)";
    const dismiss = document.createElement("button");
    dismiss.textContent = "Cancel";
    dismiss.setAttribute("aria-label", "Cancel plane cut");
    dismiss.title = "Cancel (Escape)";
    dismiss.onclick = cancel;
    this.root.append(this.title, this.status, this.apply, dismiss);
    overlay.append(this.root);
  }
  update(title: string, status: string, busy: boolean, valid: boolean, point: Point): void {
    this.root.hidden = false;
    this.root.setAttribute("aria-busy", String(busy));
    this.title.textContent = title;
    this.status.textContent = status;
    this.apply.setAttribute("aria-label", `Accept ${title}`);
    this.apply.disabled = busy || !valid;
    this.apply.textContent = busy ? "Calculating…" : "Apply";
    this.root.style.left = `${point.x}px`;
    this.root.style.top = `${point.y - this.root.offsetHeight - 20}px`;
    this.placement.fit([this.root]);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
