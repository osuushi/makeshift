import type { RadialInput } from "../preferences/radial-input.js";
import { toolCatalog } from "../tools/catalog.js";
import { toolMenuOpen } from "../tools/menu-focus.js";
import type { InteractionLease } from "./active-interaction.js";
import { changeDimension, dimensionValues } from "./dimension-values.js";
import type { Quantity } from "./drag-state.js";
import type { SketchEditor } from "./editor.js";

export interface DimensionField {
  quantity: Quantity;
  label: HTMLLabelElement;
  input: HTMLInputElement;
  lock: HTMLButtonElement;
  radial?: RadialInput;
}

/** Own one field's text until ordinary acceptance succeeds or the user cancels. */
export class DimensionFieldDraft {
  duplicate = false;
  private lease: InteractionLease | null = null;
  private focused: DimensionField | null = null;
  private committing: Promise<boolean> | null = null;
  constructor(
    private editor: SketchEditor,
    private fields: () => DimensionField[],
    private format: (value: number) => string,
  ) {}
  get waiting(): boolean {
    return this.committing !== null;
  }
  owns(input: HTMLInputElement): boolean {
    return !!this.lease && this.focused?.input === input;
  }
  bind(field: DimensionField, next: (reverse: boolean) => Promise<void>): void {
    const input = field.input;
    input.addEventListener("focus", () => void this.focus(field));
    input.addEventListener("blur", () => {
      if (!toolMenuOpen() && this.focused === field) void this.commit(field);
    });
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.cancel();
        input.blur();
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        const committed = this.commit(field);
        if (!(typeof committed === "boolean" ? committed : await committed)) return;
        if (event.key === "Enter") input.blur();
        else {
          await next(event.shiftKey);
          // A single-field cycle stays focused, so no focus event reacquires it.
          if (document.activeElement === input && !this.owns(input)) await this.focus(field);
        }
      }
    });
  }
  private async focus(field: DimensionField): Promise<void> {
    if (toolMenuOpen() || toolCatalog(this.editor).switching) return;
    const previous = this.focused;
    if (previous && previous !== field) {
      const committed = this.commit(previous);
      if (!(typeof committed === "boolean" ? committed : await committed)) {
        previous.input.focus();
        return;
      }
    }
    if (toolCatalog(this.editor).switching) return;
    if (!this.lease) {
      this.lease = this.editor.interactions.acquire(
        "numeric",
        () => this.cancel(),
        async () => this.finish(),
        { navigation: "when-released" },
      );
      // Numeric values during a held sketch gesture belong to its pointer owner.
      if (!this.lease && !this.editor.isDragging) return;
      this.focused = field;
      field.input.dataset.original = field.input.value;
    }
    field.input.select();
    this.editor.refresh();
  }
  finish(): boolean | Promise<boolean> {
    return this.focused ? this.commit(this.focused) : !this.lease;
  }
  private commit(field: DimensionField): boolean | Promise<boolean> {
    if (this.committing) return this.committing;
    const lease = this.lease;
    if (field.input.value === field.input.dataset.original) {
      field.input.removeAttribute("aria-invalid");
      this.end(lease);
      return true;
    }
    if (lease ? !lease.close() : !this.editor.isDragging) return false;
    this.committing = this.apply(field)
      .then((accepted) => {
        if (accepted) this.end(lease);
        else if (lease && this.lease === lease) lease.phase = "editing";
        return accepted;
      })
      .finally(() => {
        this.committing = null;
        this.editor.refresh();
      });
    return this.committing;
  }
  private async apply({ input, quantity, radial }: DimensionField): Promise<boolean> {
    const current = dimensionValues(this.editor).find((item) => item.quantity === quantity);
    try {
      if (!current) throw new Error("Select geometry with this dimension");
      if (!input.value.trim()) throw new Error("Enter a number");
      const value = radial ? radial.read() : Number(input.value.trim());
      if (value !== current.value || (this.editor.line && quantity === "radius"))
        await changeDimension(
          this.editor,
          quantity,
          value,
          this.lease ?? undefined,
          this.duplicate,
        );
      const accepted = dimensionValues(this.editor).find((item) => item.quantity === quantity);
      if (accepted)
        input.value = this.format(radial ? radial.display(accepted.value) : accepted.value);
      input.dataset.original = input.value;
      input.removeAttribute("aria-invalid");
      return true;
    } catch (error) {
      input.setAttribute("aria-invalid", "true");
      this.editor.message = error instanceof Error ? error.message : String(error);
      return false;
    }
  }
  private end(lease: InteractionLease | null): void {
    if (this.lease !== lease) return;
    this.lease = null;
    this.focused = null;
    this.duplicate = false;
    lease?.release();
  }
  cancel(): void {
    if (this.committing) return;
    const values = dimensionValues(this.editor);
    for (const field of this.fields()) {
      const value = values.find((item) => item.quantity === field.quantity);
      if (value) {
        field.input.value = this.format(
          field.radial ? field.radial.display(value.value) : value.value,
        );
        field.input.dataset.original = field.input.value;
        field.input.removeAttribute("aria-invalid");
      }
    }
    this.end(this.lease);
  }
}
