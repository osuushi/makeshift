import "./preview-status.css";

export class PreviewStatus {
  private readonly element = document.createElement("div");
  constructor() {
    this.element.className = "decorator-preview-status";
    this.element.setAttribute("role", "status");
    this.element.setAttribute("aria-live", "polite");
    this.element.textContent = "Updating decorator previews…";
    this.element.hidden = true;
    document.body.append(this.element);
  }
  update(busy: boolean, visible: boolean): void {
    this.element.hidden = !busy || !visible;
    this.element.dataset.busy = String(busy);
  }
  dispose(): void {
    this.element.remove();
  }
}
