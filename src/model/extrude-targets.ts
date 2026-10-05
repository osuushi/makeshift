import type { SketchEditor } from "../sketch/editor.js";

/** Local selection of current bodies, independent of input profile selection. */
export class ExtrudeTargets {
  readonly root = document.createElement("div");
  selected: string[] | undefined;
  restoredEligible: string[] | undefined;
  private key = "";
  constructor(
    private editor: SketchEditor,
    private changed: () => void,
  ) {
    this.root.className = "extrude-targets";
  }
  get eligible(): string[] {
    if (this.restoredEligible) return this.restoredEligible;
    return (this.editor.store.data.bodies ?? [])
      .filter((body) => this.editor.bodiesVisible && this.editor.visibility.visible(body.id))
      .map((body) => body.id);
  }
  reset(): void {
    this.selected = undefined;
    this.restoredEligible = undefined;
    this.key = "";
  }
  update(visible: boolean): void {
    this.root.hidden = !visible;
    if (!visible) return;
    for (const button of this.root.querySelectorAll("button"))
      button.disabled = this.editor.blocked;
    const bodies = this.editor.store.data.bodies ?? [];
    const eligible = this.eligible;
    const selected = this.selected ?? this.editor.store.booleanTargets;
    const key = JSON.stringify([bodies.map((b) => b.id), eligible, selected]);
    if (key === this.key) return;
    this.key = key;
    this.root.replaceChildren();
    const label = document.createElement("span");
    label.textContent = "Targets";
    this.root.append(label);
    bodies.forEach((body, index) => {
      if (!eligible.includes(body.id)) return;
      const button = document.createElement("button");
      button.textContent = `Body ${index + 1}`;
      button.disabled = this.editor.blocked;
      button.setAttribute("aria-label", `Target body ${index + 1}`);
      button.setAttribute("aria-pressed", String(selected.includes(body.id)));
      button.onclick = () => {
        if (this.editor.blocked) return;
        this.selected = selected.includes(body.id)
          ? selected.filter((id) => id !== body.id)
          : [...selected, body.id];
        this.key = "";
        this.changed();
      };
      this.root.append(button);
    });
  }
}
