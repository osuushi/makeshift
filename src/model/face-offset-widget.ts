import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import {
  compactCleanup,
  distanceField,
  positionAxialPanel,
  updateAxialArrow,
} from "./axial-widget.js";
import type { Face } from "./body.js";
import { cleanupButton } from "./cleanup-button.js";
import { projectedAxis } from "./extrude-axis.js";
import type { OffsetQuantity } from "./offset-quantity.js";
import { WidgetClearance } from "./widget-clearance.js";

export class FaceOffsetWidget {
  readonly cleanup = cleanupButton();
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly handle = document.createElement("button");
  readonly input = document.createElement("input");
  readonly quantity = document.createElement("select");
  readonly options = document.createElement("div");
  private dismiss = document.createElement("button");
  private accept = document.createElement("button");
  constructor(overlay: HTMLElement, accept: () => void, cancel: () => void) {
    this.root.className = "face-offset-widget axial-widget";
    this.handle.setAttribute("aria-label", "Offset faces");
    this.handle.className = "face-offset-handle axial-arrow";
    this.input.type = "text";
    this.input.inputMode = "decimal";
    this.quantity.title = "Choose the value to edit";
    this.quantity.className = "offset-quantity";
    this.quantity.setAttribute("aria-label", "Offset mode");
    this.accept.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>';
    this.accept.setAttribute("aria-label", "Accept face offset");
    this.accept.title = "Accept face offset (Enter)";
    this.accept.onclick = accept;
    const dismiss = this.dismiss;
    dismiss.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>';
    dismiss.setAttribute("aria-label", "Cancel face offset");
    dismiss.title = "Cancel face offset (Escape)";
    dismiss.onclick = cancel;
    this.options.className = "face-offset-options axial-panel";
    const actions = document.createElement("div");
    actions.className = "axial-actions";
    compactCleanup(this.cleanup);
    actions.append(this.quantity, this.accept, dismiss, this.cleanup);
    this.options.append(distanceField(this.input), actions);
    this.root.append(this.handle, this.options);
    overlay.append(this.root);
    this.root.hidden = true;
  }
  update(
    editor: SketchEditor,
    axis: { center: Vector; normal: Vector; width?: Vector },
    active: boolean,
    distance: number,
    quantity: OffsetQuantity,
    valid: boolean,
    blend: Face["blend"],
    invalid: boolean,
  ) {
    const center = axis.center.map(
      (value, i) => value + axis.normal[i] * (active && Number.isFinite(distance) ? distance : 0),
    ) as Vector;
    const p = editor.world.project(center),
      direction = projectedAxis(editor, center, axis.normal);
    this.root.hidden = false;
    positionAxialPanel(this.root, this.options, p);
    this.handle.setAttribute("aria-label", blend ? "Resize fillet" : "Offset faces");
    this.handle.title = direction.endOn
      ? "Offset faces · looking along axis: drag up/down, or click to type"
      : blend
        ? "Resize fillet · drag outward to add material, or click to enter radius"
        : "Offset faces · drag along arrow or click to type (positive adds material)";
    updateAxialArrow(
      this.handle,
      editor.world.camera,
      axis.normal,
      blend ? "fillet" : "offset",
      direction,
      invalid,
      axis.width,
    );
    this.options.hidden = false;
    this.quantity.hidden = !!blend;
    const modes = quantity.modes;
    if (Array.from(this.quantity.options, (option) => option.value).join() !== modes.join())
      this.quantity.replaceChildren(
        ...modes.map(
          (mode) =>
            new Option({ thickness: "Thickness", radius: "Radius", offset: "Offset" }[mode], mode),
        ),
      );
    this.quantity.value = quantity.mode;
    this.quantity.disabled = modes.length === 1 || editor.blocked;
    this.input.setAttribute(
      "aria-label",
      blend
        ? "Fillet face radius"
        : quantity.mode === "thickness"
          ? "Face thickness"
          : quantity.mode === "radius"
            ? "Face radius"
            : "Face offset distance",
    );
    this.input.title = blend
      ? "Existing fillet radius (mm)"
      : quantity.mode === "thickness"
        ? "Absolute distance to the reference wall (mm)"
        : quantity.mode === "radius"
          ? "Absolute face radius (mm)"
          : "Signed material-outward offset (mm)";
    if (!numericFocus(this.input)) {
      const value = quantity.value(distance);
      this.input.value = Number.isFinite(value) ? String(Number(value.toPrecision(4))) : "";
    }
    this.input.setAttribute("aria-invalid", String(active && invalid && !valid && !editor.blocked));
    this.accept.disabled = !active || !valid || distance === 0 || editor.blocked;
    this.dismiss.disabled = !active || editor.blocked;
    this.placement.fit([this.handle, this.options]);
  }
  dispose() {
    this.placement.dispose();
    this.root.remove();
  }
}
