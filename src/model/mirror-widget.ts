import type { SketchEditor } from "../sketch/editor.js";
import { selectionAnchor } from "./selection-anchor.js";
import { WidgetClearance } from "./widget-clearance.js";

export class MirrorWidget {
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly offset = document.createElement("input");
  readonly keep = document.createElement("input");
  readonly accept = document.createElement("button");
  readonly cancel = document.createElement("button");
  constructor(overlay: HTMLElement) {
    this.root.className = "mirror-widget";
    this.root.hidden = true;
    const label = document.createElement("label");
    label.textContent = "Offset ";
    this.offset.type = "text";
    this.offset.inputMode = "decimal";
    this.offset.setAttribute("aria-label", "Mirror offset");
    this.offset.value = "0";
    label.append(this.offset, " mm");
    const keepLabel = document.createElement("label");
    this.keep.type = "checkbox";
    this.keep.checked = true;
    keepLabel.append(this.keep, "Keep original");
    const actions = document.createElement("div");
    this.accept.textContent = "✓";
    this.accept.setAttribute("aria-label", "Accept mirror");
    this.cancel.textContent = "×";
    this.cancel.setAttribute("aria-label", "Cancel mirror");
    actions.append(this.accept, this.cancel);
    this.root.append(label, keepLabel, actions);
    overlay.append(this.root);
  }
  open(editor: SketchEditor): void {
    this.keep.checked = true;
    this.offset.value = "0";
    const point = editor.world.active
      ? editor.pointer
      : editor.world.project(selectionAnchor(editor));
    const bounds = editor.world.canvas.getBoundingClientRect();
    this.root.style.left = `${Math.max(210, Math.min(bounds.width - 230, (point?.x ?? bounds.width / 2) - bounds.left + 50))}px`;
    this.root.style.top = `${Math.max(90, Math.min(bounds.height - 220, (point?.y ?? bounds.height / 2) - bounds.top + 55))}px`;
    this.root.hidden = false;
  }
  update(active: boolean, valid: boolean, busy: boolean, closing: boolean): void {
    this.root.hidden = !active;
    this.accept.disabled = !valid || busy;
    this.offset.disabled = closing;
    this.keep.disabled = closing;
    this.placement.fit([this.root]);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
