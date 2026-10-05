import "./reopen-completion.css";

/** Retain the accepted completion choice visibly in the reopened operation. */
export class ReopenCompletion {
  readonly root = document.createElement("label");
  readonly input = document.createElement("input");
  constructor() {
    this.root.className = "reopen-completion";
    this.root.hidden = true;
    this.input.type = "checkbox";
    this.input.setAttribute("aria-label", "Clean up on acceptance");
    this.root.title = "Uncheck to preserve subdivisions when accepting this reopened operation";
    this.root.append(this.input, "Clean up on acceptance");
  }
  begin(cleanup: boolean): void {
    this.root.hidden = false;
    this.input.checked = cleanup;
  }
  get cleanup(): boolean {
    return !this.root.hidden && this.input.checked;
  }
  reset(): void {
    this.root.hidden = true;
    this.input.checked = false;
  }
}
