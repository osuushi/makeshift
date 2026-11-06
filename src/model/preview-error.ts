import "./preview-error.css";

/** Failed numeric drafts stay editable; geometry search is an explicit action. */
export class PreviewError {
  readonly root = document.createElement("div");
  readonly findNearest = document.createElement("button");
  private message = document.createElement("span");
  constructor() {
    this.root.className = "preview-error";
    this.root.id = `preview-error-${crypto.randomUUID()}`;
    this.root.setAttribute("role", "status");
    this.findNearest.type = "button";
    this.findNearest.textContent = "Find Nearest";
    this.root.append(this.message, this.findNearest);
    this.root.hidden = true;
  }
  update(error: string, canFind: boolean, busy: boolean): void {
    this.root.hidden = !error;
    this.message.textContent = error;
    this.findNearest.hidden = !canFind;
    this.findNearest.disabled = busy;
  }
}
