import { idleReason, toolCatalog } from "../tools/catalog.js";
import { numericFocus } from "../tools/menu-focus.js";
import { layoutLocalControls } from "./control-layout.js";
import { cornerLock } from "./corner-angle.js";
import { selectedCorner, toggleCornerLock } from "./corner-angle-controls.js";
import { type DimensionField, DimensionFieldDraft } from "./dimension-field-draft.js";
import { dimensionLock, dimensionLockTarget, toggleDimensionLock } from "./dimension-locks.js";
import { dimensionValues } from "./dimension-values.js";
import type { Quantity } from "./drag-state.js";
import type { SketchEditor } from "./editor.js";
import type { NumericFields } from "./numeric-edit.js";
import { focusNumericField } from "./numeric-focus.js";
import { sketchIcon } from "./sketch-icons.js";

export class Dimensions implements NumericFields {
  private key = "";
  private disposeTools: () => void;
  private draft: DimensionFieldDraft;
  private fields: DimensionField[] = [];
  private readonly abort = new AbortController();
  constructor(
    private editor: SketchEditor,
    private overlay: HTMLElement,
  ) {
    this.draft = new DimensionFieldDraft(
      editor,
      () => this.fields,
      (value) => this.format(value),
    );
    const disposers = (["width", "height", "length", "radius", "cornerAngle"] as const).map(
      (quantity) =>
        toolCatalog(editor).register({
          id: `lock-${quantity}`,
          label: `Toggle ${quantity === "cornerAngle" ? "corner angle" : quantity} lock`,
          category: "Constrain",
          aliases: [`constrain ${quantity}`],
          finishEdit: true,
          reason: () =>
            (editor.interactions.current?.kind === "numeric" ? null : idleReason(editor)) ??
            ((
              quantity === "cornerAngle"
                ? selectedCorner(editor)
                : dimensionLockTarget(editor, quantity)
            )
              ? null
              : "Select geometry with this dimension"),
          run: () =>
            quantity === "cornerAngle"
              ? toggleCornerLock(editor)
              : toggleDimensionLock(editor, quantity),
        }),
    );
    this.disposeTools = () => {
      for (const dispose of disposers) dispose();
    };
    document.addEventListener(
      "pointerdown",
      (event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.target instanceof Element && event.target.closest(".dimension-lock")) return;
        if (
          event.target instanceof Element &&
          event.target.closest("[data-history], [data-action]")
        )
          this.cancel();
        else this.commitFocused();
      },
      { capture: true, signal: this.abort.signal },
    );
    editor.world.changed.add(this.update);
  }
  update = (): void => {
    const values = dimensionValues(this.editor);
    const key = values.length
      ? `${this.editor.sketch?.id}/${[...this.editor.selectionOwners].sort().join()}/${values.map((v) => v.quantity).join()}`
      : "";
    if (key !== this.key) {
      this.key = key;
      if (!this.draft.waiting) this.cancel();
      for (const field of this.fields) field.label.remove();
      this.fields = [];
      for (const value of values) this.addField(value.quantity, value.label, value.unit);
    }
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    for (const value of values) {
      const field = this.fields.find((item) => item.quantity === value.quantity);
      if (!field) continue;
      field.input.readOnly = this.editor.blocked && !this.editor.isDragging;
      const corner = selectedCorner(this.editor);
      const locked =
        value.quantity === "cornerAngle"
          ? !!(corner && this.editor.sketch && cornerLock(this.editor.sketch, corner))
          : !!dimensionLock(this.editor, value.quantity);
      field.lock.hidden =
        (value.quantity === "cornerAngle"
          ? !corner
          : !dimensionLockTarget(this.editor, value.quantity)) || this.editor.isDragging;
      field.lock.disabled = this.editor.blocked;
      field.lock.replaceChildren(sketchIcon(locked ? "lock" : "unlock"));
      field.lock.setAttribute("aria-label", `${locked ? "Unlock" : "Lock"} ${value.label}`);
      field.lock.setAttribute("aria-pressed", String(locked));
      field.label.style.left = `${Math.max(50, Math.min(bounds.width - 50, value.screen.x - bounds.left))}px`;
      field.label.style.top = `${Math.max(70, Math.min(bounds.height - 60, value.screen.y - bounds.top))}px`;
      if (!numericFocus(field.input) && !this.draft.owns(field.input))
        field.input.value = this.format(value.value);
    }
    layoutLocalControls(this.editor, this.overlay);
  };
  private format(value: number): string {
    return Number(value.toFixed(4)).toString();
  }
  private addField(quantity: Quantity, name: string, suffix: string): void {
    const label = document.createElement("label");
    label.className = "dimension";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", name);
    input.autocomplete = "off";
    input.spellcheck = false;
    const unit = document.createElement("span");
    unit.textContent = suffix;
    const lock = document.createElement("button");
    lock.type = "button";
    lock.className = "dimension-lock";
    // Keep the field focused until the click can commit it and then toggle the lock.
    lock.addEventListener("pointerdown", (event) => event.preventDefault());
    lock.addEventListener("click", async () => {
      await toolCatalog(this.editor).invoke(`lock-${quantity}`);
      if (!this.draft.owns(input)) input.blur();
    });
    label.append(input, unit, lock);
    this.overlay.append(label);
    const field = { quantity, label, input, lock };
    this.fields.push(field);
    this.draft.bind(field, async (reverse) => {
      if (!(await this.focusTransform(reverse))) focusNumericField(this.overlay, reverse);
    });
  }
  async commitFocused(): Promise<void> {
    await this.draft.finish();
  }
  cancel(): void {
    this.draft.cancel();
  }
  async focusTransform(reverse = false): Promise<boolean> {
    const e = this.editor;
    if (
      !e.moveMode ||
      !e.sketch ||
      e.isDragging ||
      (e.interactions.current && e.interactions.current.kind !== "numeric")
    )
      return false;
    const index = e.transformRotation
      ? 2
      : e.transformAxis === "y"
        ? 1
        : e.transformAxis === "x"
          ? 0
          : -1;
    if (!(await this.draft.finish())) return false;
    const next = index < 0 ? (reverse ? 2 : 0) : (index + (reverse ? 2 : 1)) % 3;
    e.transformAxis = next === 0 ? "x" : next === 1 ? "y" : null;
    e.transformRotation = next === 2;
    e.refresh();
    this.focus(next === 0 ? "translateX" : next === 1 ? "translateY" : "angle");
    return true;
  }
  focus(quantity: Quantity, duplicate = false): void {
    this.fields.find((field) => field.quantity === quantity)?.input.focus();
    this.draft.duplicate = duplicate;
  }
  focusFirst(initial?: string): void {
    const input = this.fields[0]?.input;
    if (!input) return;
    input.focus();
    if (initial !== undefined) input.value = initial;
  }
  dispose(): void {
    this.cancel();
    this.disposeTools();
    this.abort.abort();
    this.editor.world.changed.delete(this.update);
    for (const field of this.fields) field.label.remove();
  }
}
