import { toolCatalog } from "../tools/catalog.js";
import { selectedConstraints } from "./constraint-selection.js";
import type { Constraint } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { type SketchIcon, sketchIcon } from "./sketch-icons.js";

export class ConstraintDisplay {
  private readonly panel = document.createElement("div");
  private readonly existing = document.createElement("div");
  readonly available = document.createElement("div");
  private key = "";
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.panel.className = "constraint-list";
    this.panel.setAttribute("role", "group");
    this.panel.setAttribute("aria-label", "Selected entity constraints");
    this.existing.className = "existing-constraints";
    this.available.className = "available-constraints";
    for (const [title, content] of [
      ["Existing constraints", this.existing],
      ["Available constraints", this.available],
    ] as const) {
      const section = document.createElement("section");
      section.setAttribute("aria-label", title);
      const heading = document.createElement("h2");
      heading.textContent = title;
      const empty = document.createElement("span");
      empty.className = "constraint-empty";
      empty.textContent = "None for this selection";
      section.append(heading, content, empty);
      this.panel.append(section);
    }
    overlay.append(this.panel);
    editor.world.changed.add(this.update);
    this.update();
  }
  private button(constraint: Constraint): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    const concentric =
      constraint.kind === "coincident" &&
      constraint.a.end === "center" &&
      constraint.b.end === "center";
    const name =
      constraint.kind === "point-on-edge"
        ? "Coincident"
        : concentric
          ? "Concentric"
          : constraint.kind === "corner-angle"
            ? `Angle ${Number(Math.abs(constraint.value).toFixed(4))}°`
            : "value" in constraint
              ? `${constraint.kind === "radius" ? "Radius" : "Length"} ${Number(constraint.value.toFixed(4))} mm`
              : constraint.kind === "equal"
                ? "Equal length"
                : constraint.kind[0].toUpperCase() + constraint.kind.slice(1);
    const symbol: SketchIcon = concentric
      ? "concentric"
      : constraint.kind === "corner-angle"
        ? "angle"
        : "value" in constraint
          ? "lock"
          : constraint.kind === "point-on-edge"
            ? "coincident"
            : constraint.kind;
    button.append(sketchIcon(symbol));
    button.append(document.createTextNode(name));
    button.setAttribute("aria-label", `Remove ${name} constraint`);
    button.dataset.constraint = constraint.id;
    button.dataset.action = "remove-constraint";
    button.addEventListener("pointerenter", () => {
      this.editor.constraintHover = constraint.id;
      this.editor.refresh();
    });
    button.addEventListener("focus", () => {
      this.editor.constraintHover = constraint.id;
      this.editor.refresh();
    });
    button.addEventListener("blur", () => {
      this.editor.constraintHover = null;
      this.editor.refresh();
    });
    button.addEventListener("pointerleave", () => {
      this.editor.constraintHover = null;
      this.editor.refresh();
    });
    button.addEventListener("click", () => {
      void toolCatalog(this.editor).activate({
        reason: () => null,
        run: async () => {
          const sketch = this.editor.sketch;
          if (!sketch?.constraints.some((c) => c.id === constraint.id)) return;
          await this.editor.editSketch({
            ...sketch,
            constraints: sketch.constraints.filter((c) => c.id !== constraint.id),
          });
          this.editor.constraintHover = null;
          this.editor.refresh();
        },
      });
    });
    return button;
  }
  private update = (): void => {
    const { editor } = this;
    const { locks } = selectedConstraints(editor);
    const key = JSON.stringify(locks);
    this.panel.hidden = !editor.selectionOwners.size || editor.isDragging || !editor.sketch;
    if (key !== this.key) {
      this.key = key;
      this.existing.replaceChildren(...locks.map((lock) => this.button(lock)));
    }
    for (const button of this.existing.querySelectorAll("button"))
      button.disabled = !!toolCatalog(editor).reason({ reason: () => null });
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.panel.remove();
  }
}
