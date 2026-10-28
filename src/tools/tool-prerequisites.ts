import type { SketchEditor } from "../sketch/editor.js";

export const pendingToolInputs = new WeakMap<
  SketchEditor,
  {
    id: string;
    message: string;
    cancel: () => void;
    panel?: HTMLElement;
  }
>();

/** Show the real parameter panel while its geometry inputs are incomplete. */
export class ToolPrerequisitePanel {
  private prompt = document.createElement("div");
  private disabled = new Map<HTMLInputElement | HTMLButtonElement | HTMLSelectElement, boolean>();
  private active = false;
  private positions = new Map<HTMLElement, [string, string]>();
  private cancel = document.createElement("button");
  constructor(
    private root: HTMLElement,
    private panel: HTMLElement,
  ) {
    this.prompt.className = "tool-requirement";
    this.prompt.setAttribute("role", "status");
    this.cancel.textContent = "Cancel";
    this.cancel.setAttribute("aria-label", "Cancel tool");
  }
  update(editor: SketchEditor, id: string): boolean {
    const pending = pendingToolInputs.get(editor);
    if (pending?.id !== id) {
      if (this.active) {
        this.cleanup();
        for (const [control, disabled] of this.disabled) control.disabled = disabled;
        this.disabled.clear();
        for (const [element, [left, top]] of this.positions) {
          element.style.left = left;
          element.style.top = top;
        }
        this.positions.clear();
        this.prompt.remove();
        this.cancel.remove();
        this.root.classList.remove("tool-awaiting-inputs");
        this.panel.classList.remove("tool-input-panel");
        this.active = false;
      }
      return false;
    }
    pending.panel = this.root;
    if (!this.active) {
      for (const element of [this.root, this.panel])
        this.positions.set(element, [element.style.left, element.style.top]);
    }
    this.root.style.left = "50%";
    this.root.style.top = "120px";
    if (this.panel !== this.root) this.panel.style.left = this.panel.style.top = "0px";
    this.root.hidden = false;
    this.panel.hidden = false;
    this.root.classList.add("tool-awaiting-inputs");
    this.panel.classList.add("tool-input-panel");
    this.prompt.textContent = pending.message;
    if (!this.panel.querySelector('[aria-label^="Cancel"]')) this.panel.append(this.cancel);
    this.panel.append(this.prompt);
    for (const control of this.panel.querySelectorAll<
      HTMLInputElement | HTMLButtonElement | HTMLSelectElement
    >("input, button, select")) {
      if (!this.disabled.has(control)) this.disabled.set(control, control.disabled);
      control.disabled = !control.getAttribute("aria-label")?.startsWith("Cancel");
    }
    if (!this.active) {
      const cancel = (event: MouseEvent) => {
        if (!(event.target instanceof Element) || !event.target.closest('[aria-label^="Cancel"]'))
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        pending.cancel();
      };
      this.panel.addEventListener("click", cancel, { capture: true });
      this.cleanup = () => this.panel.removeEventListener("click", cancel, { capture: true });
    }
    this.active = true;
    return true;
  }
  private cleanup = () => {};
  dispose(): void {
    this.cleanup();
    this.prompt.remove();
  }
}
