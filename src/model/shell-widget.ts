import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import { distanceField, positionAxialPanel, toolAction, updateAxialArrow } from "./axial-widget.js";
import { projectedAxis } from "./extrude-axis.js";
import { WidgetClearance } from "./widget-clearance.js";

export class ShellWidget {
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly handle = document.createElement("button");
  readonly input = document.createElement("input");
  private panel = document.createElement("div");
  private description = document.createElement("small");
  private accept: HTMLButtonElement;
  private cancel: HTMLButtonElement;
  constructor(overlay: HTMLElement, finish: () => void, cancel: () => void) {
    this.root.className = "shell-widget axial-widget";
    this.handle.className = "axial-arrow";
    this.handle.setAttribute("aria-label", "Shell thickness handle");
    this.handle.title = "Shell · drag outward or inward, or click to type";
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Shell thickness");
    this.input.title = "Signed thickness in mm: negative inward, positive outward";
    this.accept = toolAction("Accept shell", "m5 12 4 4L19 6", finish);
    this.cancel = toolAction("Cancel shell", "m6 6 12 12M18 6 6 18", cancel);
    const actions = document.createElement("div");
    actions.className = "axial-actions";
    actions.append(this.accept, this.cancel);
    this.panel.className = "axial-panel";
    this.description.style.cssText = "display:block;max-width:180px;padding:3px 0;line-height:1.4";
    this.panel.append(this.description, distanceField(this.input), actions);
    this.root.append(this.handle, this.panel);
    this.root.hidden = true;
    overlay.append(this.root);
  }
  update(
    editor: SketchEditor,
    axis: { center: Vector; normal: Vector },
    thickness: number,
    openings: number,
    active: boolean,
    valid: boolean,
    invalid: boolean,
  ): void {
    this.root.hidden = false;
    positionAxialPanel(this.root, this.panel, editor.world.project(axis.center));
    updateAxialArrow(
      this.handle,
      editor.world.camera,
      axis.normal,
      "shell",
      projectedAxis(editor, axis.center, axis.normal),
      invalid,
    );
    this.description.textContent = `${openings ? `${openings} open face${openings === 1 ? "" : "s"}` : "Closed hollow"} · − inward / + outward`;
    if (!numericFocus(this.input))
      this.input.value = Number.isFinite(thickness) ? String(Number(thickness.toPrecision(4))) : "";
    this.input.setAttribute("aria-invalid", String(invalid));
    this.accept.disabled = !active || !valid || thickness === 0 || editor.blocked;
    this.cancel.disabled = !active;
    this.placement.fit([this.handle, this.panel]);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
