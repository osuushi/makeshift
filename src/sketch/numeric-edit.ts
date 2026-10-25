import type { Quantity } from "./drag-state.js";

export interface NumericFields {
  commitFocused(): Promise<void>;
  cancel(): void;
  focus(quantity: Quantity, duplicate?: boolean): void;
  activateTransform(axis: "x" | "y" | "rotation"): Promise<boolean>;
  focusFirst(initial?: string): void;
}

export interface DragQuantityEdit {
  readonly values?: Partial<Record<Quantity, number>> | null;
  editQuantity(quantity: Quantity, value: number): void;
}

/** Composition connects the field and gesture owners before accepting input. */
export class NumericEdit {
  private owners: { fields: NumericFields; gesture: DragQuantityEdit } | null = null;
  private disposed = false;

  get dragValues(): Partial<Record<Quantity, number>> | null {
    return this.owners?.gesture.values ?? null;
  }

  connect(fields: NumericFields, gesture: DragQuantityEdit): void {
    if (this.owners || this.disposed)
      throw new Error("Numeric editing is already connected or disposed");
    this.owners = { fields, gesture };
  }

  private requireOwners() {
    if (!this.owners) throw new Error("Numeric editing is not connected");
    return this.owners;
  }

  commit(): Promise<void> {
    return this.requireOwners().fields.commitFocused();
  }
  cancel(): void {
    this.requireOwners().fields.cancel();
  }
  focus(quantity: Quantity, duplicate = false): void {
    this.requireOwners().fields.focus(quantity, duplicate);
  }
  activateTransform(axis: "x" | "y" | "rotation"): Promise<boolean> {
    return this.requireOwners().fields.activateTransform(axis);
  }
  focusFirst(initial?: string): void {
    this.requireOwners().fields.focusFirst(initial);
  }
  duringDrag(quantity: Quantity, value: number): void {
    this.requireOwners().gesture.editQuantity(quantity, value);
  }
  dispose(): void {
    this.owners = null;
    this.disposed = true;
  }
}
