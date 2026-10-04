import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import { distanceField, positionAxialPanel, toolAction, updateAxialArrow } from "./axial-widget.js";
import type { Body } from "./body.js";
import type { ErosionParameters } from "./erosion-parameters.js";
import { erosionQualityText } from "./erosion-quality.js";
import { projectedAxis } from "./extrude-axis.js";
import { offsetHandle } from "./face-offset-targets.js";
import "./erosion-widget.css";

export function erosionAxis(editor: SketchEditor, body: Body): { center: Vector; normal: Vector } {
  const face = body.faces[0];
  const handle =
    face && (face.plane || face.cylinder || face.offsetHandle) ? offsetHandle(editor, face) : null;
  return handle
    ? { center: handle.center, normal: [-handle.normal[0], -handle.normal[1], -handle.normal[2]] }
    : { center: body.center, normal: [0, 0, -1] };
}

export class ErosionWidget {
  readonly root = document.createElement("div");
  readonly handle = document.createElement("button");
  readonly thickness = document.createElement("input");
  readonly allowance = document.createElement("input");
  readonly maxFaces = document.createElement("input");
  readonly meshDetail = document.createElement("select");
  private fields = new Map<HTMLInputElement, { label: HTMLElement; field: HTMLElement }>();
  private detailLabel = document.createElement("small");
  private quality = document.createElement("small");
  readonly method = document.createElement("select");
  private panel = document.createElement("div");
  private description = document.createElement("small");
  private accept: HTMLButtonElement;
  private cancel: HTMLButtonElement;
  private keep: HTMLButtonElement;
  private suggestion = document.createElement("button");
  constructor(
    overlay: HTMLElement,
    finish: () => void,
    cancel: () => void,
    keep: () => void,
    suggest: () => void,
  ) {
    this.root.className = "erosion-widget axial-widget";
    this.handle.className = "axial-arrow";
    this.handle.setAttribute("aria-label", "Erosion distance handle");
    this.handle.title = "Erode · drag inward or click to type erosion distance";
    this.accept = toolAction("Accept erosion", "m5 12 4 4L19 6", finish);
    this.cancel = toolAction("Cancel erosion", "m6 6 12 12M18 6 6 18", cancel);
    this.keep = toolAction("Keep originals", "M8 8h13v13H8ZM3 16V3h13", keep);
    const actions = document.createElement("div");
    actions.className = "axial-actions";
    actions.append(this.keep, this.accept, this.cancel);
    this.panel.className = "axial-panel";
    this.method.setAttribute("aria-label", "Erosion method");
    this.method.title = "Remesh reconstructs an eroded mesh; Analytic uses CAD offsets";
    for (const [value, label] of [
      ["fast", "Remesh (usually faster, more flexible)"],
      ["accurate", "Analytic (more accurate, often slower)"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.method.append(option);
    }
    this.panel.append(this.method);
    this.field(this.thickness, "Erode by", "Minimum wall thickness in mm");
    this.field(
      this.allowance,
      "Extra thickness allowance",
      "Extra thickness as a percentage of minimum thickness",
      "%",
    );
    this.detailLabel.textContent = "Mesh detail";
    this.detailLabel.className = "erosion-field-label";
    this.meshDetail.setAttribute("aria-label", "Mesh detail");
    this.meshDetail.title =
      "Spacing adapts to body dimensions, surface area and Erode by; finer detail uses a larger sampling budget";
    for (const [value, label] of [
      ["coarse", "Coarse"],
      ["standard", "Standard"],
      ["fine", "Fine"],
    ]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      this.meshDetail.append(option);
    }
    this.panel.append(this.detailLabel, this.meshDetail);
    this.field(
      this.maxFaces,
      "CAD face budget",
      "Maximum CAD faces per source body, from 32 to 256",
      "faces",
    );
    this.quality.className = "erosion-quality";
    this.quality.setAttribute("role", "status");
    this.panel.append(this.quality);
    this.description.className = "erosion-status";

    this.description.setAttribute("role", "status");
    this.suggestion.className = "erosion-suggestion";
    this.suggestion.type = "button";
    this.suggestion.setAttribute("aria-label", "Try suggested allowance");
    this.suggestion.onclick = suggest;
    this.panel.append(this.description, this.suggestion, actions);
    this.root.append(this.handle, this.panel);
    this.root.hidden = true;
    overlay.append(this.root);
  }
  private field(input: HTMLInputElement, name: string, title: string, unit = "mm"): void {
    input.type = "text";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", name);
    input.title = title;
    const label = document.createElement("small");
    label.textContent = name;
    label.className = "erosion-field-label";
    const field = distanceField(input);
    field.querySelector("span")?.replaceChildren(unit);
    this.panel.append(label, field);
    this.fields.set(input, { label, field });
  }
  update(
    editor: SketchEditor,
    axis: { center: Vector; normal: Vector },
    values: ReturnType<ErosionParameters["snapshot"]>,
    active: boolean,
    valid: boolean,
    invalid: boolean,
    count: number | null,
    suggestion: number | null,
  ): void {
    this.root.hidden = false;
    this.method.value = values.method ?? "fast";
    const fast = values.method === "fast";
    const thickness = this.fields.get(this.thickness);
    const name = "Erode by";
    if (thickness) thickness.label.textContent = name;
    this.thickness.setAttribute("aria-label", name);
    this.thickness.title = fast
      ? "Approximate inward distance in mm; not a guaranteed minimum"
      : "Minimum wall thickness in mm";
    for (const [input, visible] of [
      [this.allowance, !fast],
      [this.maxFaces, fast],
    ] as const) {
      const pair = this.fields.get(input);
      if (pair) pair.label.hidden = pair.field.hidden = !visible;
    }
    this.meshDetail.hidden = this.detailLabel.hidden = !fast;
    this.meshDetail.value = values.meshDetail;
    const quality = editor.store.erosionQuality;
    this.quality.hidden = !fast;
    this.quality.textContent =
      valid && quality?.length
        ? erosionQualityText(quality)
        : "Approximate target; thickness is not guaranteed";
    positionAxialPanel(this.root, this.panel, editor.world.project(axis.center));

    updateAxialArrow(
      this.handle,
      editor.world.camera,
      axis.normal,
      "shell",
      projectedAxis(editor, axis.center, axis.normal),
      invalid,
    );
    for (const [input, value] of [
      [this.thickness, values.thickness],
      [this.allowance, values.allowancePercent],
      [this.maxFaces, values.maxFaces],
    ] as const) {
      if (!numericFocus(input))
        input.value = Number.isFinite(value) ? String(Number(value.toPrecision(4))) : "";
      input.setAttribute("aria-invalid", String(invalid));
    }
    this.description.textContent = invalid
      ? editor.message || "Could not create a result at these values"
      : count === null
        ? "Erode selected bodies"
        : count === 0
          ? "Empty result"
          : `${count} result ${count === 1 ? "body" : "bodies"}`;
    this.suggestion.hidden = fast || suggestion === null;
    this.suggestion.disabled = editor.blocked;
    this.suggestion.textContent = suggestion === null ? "" : `Try ${suggestion}% allowance`;
    this.suggestion.title =
      "Suggested from the remaining interior regions; minimum thickness stays unchanged";
    this.keep.setAttribute("aria-pressed", String(values.keepOriginals));
    this.keep.disabled = editor.blocked;
    this.accept.disabled = !active || !valid || values.thickness <= 0 || editor.blocked;
    this.cancel.disabled = !active;
  }
  dispose(): void {
    this.root.remove();
  }
}
