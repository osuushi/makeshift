import {
  onRadialDimensionChange,
  radialDimension,
  radialDisplay,
  radialName,
  radialRadius,
  setRadialDimension,
} from "./radial-dimension.js";
import "./radial-input.css";

/** A presentation toggle: it never dispatches an input or geometry edit. */
export class RadialInput {
  readonly button = document.createElement("button");
  private mode = radialDimension();
  private active = true;
  private unsubscribe: () => void;
  constructor(
    private input: HTMLInputElement,
    private changed?: () => void,
  ) {
    this.button.type = "button";
    this.button.className = "radial-toggle";
    // Preserve numeric drafts and the on-screen keyboard while switching units.
    this.button.onpointerdown = (event) => event.preventDefault();
    this.button.onclick = (event) => {
      event.preventDefault();
      setRadialDimension(radialDimension() === "radius" ? "diameter" : "radius");
    };
    this.unsubscribe = onRadialDimensionChange(() => {
      const mode = radialDimension();
      if (this.active && mode !== this.mode) {
        const factor = mode === "diameter" ? 2 : 0.5;
        const text = this.input.value;
        if (this.input.type === "range") {
          for (const attr of ["min", "max", "step"] as const)
            this.input[attr] = this.convertText(this.input[attr], factor);
        }
        this.input.value = this.convertText(text, factor);
        if (this.input.dataset.original !== undefined)
          this.input.dataset.original = this.convertText(this.input.dataset.original, factor);
      }
      this.mode = mode;
      this.update(this.active);
      this.changed?.();
    });
    this.update();
  }
  private convertText(text: string, factor: number): string {
    const value = Number(text);
    return text.trim() && Number.isFinite(value) ? String(value * factor) : text;
  }
  update(active = true): void {
    if (active !== this.active && radialDimension() === "diameter") {
      const factor = active ? 2 : 0.5;
      this.input.value = this.convertText(this.input.value, factor);
      if (this.input.dataset.original !== undefined)
        this.input.dataset.original = this.convertText(this.input.dataset.original, factor);
    }
    this.active = active;
    this.button.hidden = !active;
    this.button.textContent = radialDimension() === "radius" ? "R" : "Ø";
    this.button.title = `Switch to ${radialDimension() === "radius" ? "diameter" : "radius"} · default for all drawings`;
    this.button.setAttribute("aria-label", this.button.title);
    this.button.setAttribute("aria-pressed", String(radialDimension() === "diameter"));
    if (!active) return;
    for (const attribute of ["aria-label", "title"]) {
      const text = this.input.getAttribute(attribute);
      if (text)
        this.input.setAttribute(
          attribute,
          text.replace(/radius|diameter/gi, (word) =>
            word[0] === word[0].toUpperCase() ? radialName() : radialName().toLowerCase(),
          ),
        );
    }
  }
  display(value: number): number {
    return this.active ? radialDisplay(value) : value;
  }
  read(): number {
    const value = this.input.value.trim() ? Number(this.input.value) : NaN;
    return this.active ? radialRadius(value) : value;
  }
  dispose(): void {
    this.unsubscribe();
    this.button.remove();
  }
}
