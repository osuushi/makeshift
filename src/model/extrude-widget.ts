import { numericFocus } from "../tools/menu-focus.js";
import { distanceField, positionAxialPanel, toolAction, updateAxialArrow } from "./axial-widget.js";
import { ExtrudeDraft } from "./extrude-draft.js";
import { ExtrudeQuantity } from "./extrude-quantity.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./extrude-widget.css";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import type { Extrusion } from "./body.js";
import { modeIcons } from "./boolean-icons.js";
import { extrusionAxis, projectedAxis } from "./extrude-axis.js";
import { revolutionPoint } from "./revolve-axis.js";

export class ExtrudeWidget {
  readonly draft: ExtrudeDraft;
  readonly quantity: ExtrudeQuantity;
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly handle = document.createElement("button");
  readonly input = document.createElement("input");
  readonly symmetric = document.createElement("input");
  private currentAxis: ReturnType<typeof extrusionAxis> = null;
  get axis() {
    return this.currentAxis;
  }
  private accept: HTMLButtonElement;
  private dismiss: HTMLButtonElement;
  private options = document.createElement("div");
  addQuantity(row: HTMLElement): void {
    this.draft.root.before(row);
  }
  constructor(
    setMode: (mode: Extrusion["mode"]) => void,
    draftChanged: () => void,
    symmetryChanged: (value: boolean) => void,
    finish: () => void,
    cancel: () => void,
  ) {
    this.draft = new ExtrudeDraft(draftChanged);
    this.quantity = new ExtrudeQuantity(draftChanged);
    this.root.className = "extrude-controls axial-widget";
    this.handle.className = "extrude-arrow axial-arrow";
    this.handle.setAttribute("aria-label", "Drag extrusion");
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.input.setAttribute("aria-label", "Extrusion distance");
    this.input.title = "Extrusion distance (mm)";
    this.options.className = "extrude-options axial-panel";
    this.symmetric.type = "checkbox";
    this.symmetric.setAttribute("aria-label", "Symmetric extrusion");
    this.symmetric.onchange = () => symmetryChanged(this.symmetric.checked);
    const symmetry = document.createElement("label");
    symmetry.className = "extrude-symmetry";
    symmetry.append(this.symmetric, "Symmetric");
    symmetry.title = "Center about source plane · distance is total depth · Option while dragging";
    this.options.append(distanceField(this.input), this.quantity.select, symmetry, this.draft.root);
    const actions = document.createElement("div");
    actions.className = "axial-actions";
    this.accept = toolAction("Accept extrusion", "m5 12 4 4L19 6", finish);
    this.dismiss = toolAction("Cancel extrusion", "m6 6 12 12M6 18 18 6", cancel);
    for (const [mode, label, key] of [
      ["union", "Union", "U"],
      ["subtract", "Subtract", "S"],
      ["intersect", "Intersect", "I"],
      ["new", "New body", "N"],
    ] as const) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", label);
      button.title = `${label} (${key})`;
      button.dataset.mode = mode;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5">${modeIcons[mode]}</svg>`;
      button.onclick = () => setMode(mode);
      actions.append(button);
    }
    actions.append(this.accept, this.dismiss);
    this.options.append(actions);
    this.root.append(this.handle, this.options);
  }
  update(
    editor: SketchEditor,
    active: boolean,
    distance: number,
    mode: Extrusion["mode"] | undefined,
    valid: boolean,
    twist?: Extrusion["twist"],
    symmetric = false,
  ) {
    if (!active || !this.currentAxis) this.currentAxis = extrusionAxis(editor);
    const axis = this.axis;
    this.quantity.configure(editor, active, !!axis?.normalExtrusion);
    this.root.hidden = !!editor.world.active || !axis;
    this.options.hidden = false;
    this.symmetric.checked = symmetric;
    const capDistance = distance / (symmetric ? 2 : 1);
    this.draft.update(capDistance);
    this.draft.root.hidden = !!axis?.normalExtrusion;
    if (this.symmetric.parentElement) this.symmetric.parentElement.hidden = !!axis?.normalExtrusion;
    this.input.title = axis?.normalExtrusion
      ? this.quantity.mode === "radius"
        ? "Absolute face radius (mm)"
        : "Signed material-outward extrusion (mm)"
      : symmetric
        ? "Total symmetric extrusion depth (mm)"
        : "Extrusion distance (mm)";
    if (!axis) return;
    const straight = axis.center.map(
      (v, i) => v + axis.normal[i] * (Number.isFinite(capDistance) ? capDistance : 0),
    ) as Vector;
    const center =
      twist && Number.isFinite(twist.angle)
        ? revolutionPoint(
            { origin: twist.origin, direction: axis.normal },
            axis.center,
            twist.angle / (symmetric ? 2 : 1),
            Number.isFinite(capDistance) ? capDistance : 0,
          )
        : straight;
    const p = editor.world.project(center),
      direction = projectedAxis(editor, center, axis.normal);
    positionAxialPanel(this.root, this.options, p);
    this.handle.title = direction.endOn
      ? "Extrude · looking along axis: drag up/down, or click to enter distance"
      : "Extrude · drag along arrow, or click to enter distance";
    const invalid = active && distance !== 0 && !valid && !editor.blocked;
    updateAxialArrow(this.handle, editor.world.camera, axis.normal, "extrude", direction, invalid);
    this.input.setAttribute("aria-invalid", String(invalid));
    this.accept.disabled = !active || !valid || distance === 0 || editor.blocked;
    this.dismiss.disabled = !active;
    if (!numericFocus(this.input))
      this.input.value = Number.isFinite(distance)
        ? String(Number(this.quantity.display(distance).toPrecision(4)))
        : "";
    for (const button of this.options.querySelectorAll<HTMLButtonElement>("[data-mode]"))
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  }
  fit(): void {
    this.placement.fit(
      [...this.root.children].filter(
        (element): element is HTMLElement => element instanceof HTMLElement,
      ),
    );
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
