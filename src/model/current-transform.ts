import type { Vector } from "../sketch/planes.js";
import { numericFocus } from "../tools/menu-focus.js";
import type { TopologyMovement } from "./topology-movement.js";
import "./current-transform.css";

/** Editable canonical transform, distinct from the gizmo's next extra gesture. */
export class CurrentTransform {
  readonly root = document.createElement("details");
  readonly translation: HTMLInputElement[] = [];
  readonly angle: HTMLInputElement;
  private axis = document.createElement("small");
  private pivot = document.createElement("small");
  constructor(
    private kind: "faces" | "edges",
    change: (translation: Vector, angle: number) => void,
    refresh: () => void,
  ) {
    this.root.className = "current-transform";
    this.root.addEventListener("toggle", refresh);
    this.root.hidden = true;
    const heading = document.createElement("summary");
    heading.textContent = "Current transform";
    this.root.append(heading);
    for (const name of ["X", "Y", "Z"])
      this.translation.push(this.input(`Cumulative translation ${name}`, `${name} mm`));
    this.angle = this.input("Cumulative face angle", "Angle °");
    if (this.angle.parentElement) this.angle.parentElement.hidden = kind === "edges";
    this.axis.hidden = this.pivot.hidden = kind === "edges";
    this.root.append(this.axis, this.pivot);
    this.root.addEventListener("input", () =>
      change(
        this.translation.map((input) => this.readValue(input)) as Vector,
        kind === "faces" ? this.readValue(this.angle) : 0,
      ),
    );
  }
  private input(name: string, text: string): HTMLInputElement {
    const label = document.createElement("label"),
      input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.setAttribute("aria-label", name);
    label.append(text, input);
    this.root.append(label);
    return input;
  }
  show(edit: TopologyMovement): void {
    this.root.hidden = false;
    this.root.open = true;
    this.update(edit, false, true);
  }
  private readValue(input: HTMLInputElement): number {
    const value = input.value.trim() ? Number(input.value) : NaN;
    input.setAttribute("aria-invalid", String(!Number.isFinite(value)));
    return value;
  }
  update(edit: TopologyMovement | null, closing: boolean, restored = false): void {
    if (this.root.hidden || !edit) return;
    this.translation.forEach((input, i) => {
      if (restored || !numericFocus(input)) input.value = String(edit.translation[i]);
      this.readValue(input);
      input.disabled = closing;
    });
    if (restored || !numericFocus(this.angle)) this.angle.value = String(edit.angle);
    if (this.kind === "faces") this.readValue(this.angle);
    else this.angle.removeAttribute("aria-invalid");
    this.angle.disabled = closing;
    const vector = (values: Vector) => values.map((value) => Number(value.toFixed(5))).join(", ");
    this.axis.textContent = `Axis: ${vector(edit.axis)}`;
    this.pivot.textContent = `Transform pivot: ${vector(edit.pivot)}`;
  }
  reset(): void {
    this.root.hidden = true;
    this.root.open = false;
    for (const input of [...this.translation, this.angle]) {
      input.removeAttribute("aria-invalid");
      input.blur();
    }
  }
}
