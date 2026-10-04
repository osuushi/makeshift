import { boundaryPoints } from "../sketch/curve-spans.js";
import type { SketchEditor } from "../sketch/editor.js";
import { worldPoint } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import type { LiftSource } from "./body.js";
import { modeIcons } from "./boolean-icons.js";
import type { Loft } from "./loft.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./loft.css";

export type LoftSectionAction = "up" | "down" | "remove" | "previous" | "next";
export class LoftWidget {
  readonly root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  readonly sections = document.createElement("ol");
  readonly add = this.button("Add loft sections", "+ Sections");
  readonly automatic = this.button("Reset loft alignment", "Auto alignment");
  readonly shape = document.createElement("select");
  readonly modes = document.createElement("div");
  readonly accept = this.button("Accept loft", "✓");
  readonly cancel = this.button("Cancel loft", "×");
  private key = "";
  constructor(
    private sectionAction: (index: number, action: LoftSectionAction) => void,
    change: () => void,
    setMode: (mode: Loft["mode"]) => void,
  ) {
    this.root.className = "loft-controls";
    this.sections.setAttribute("aria-label", "Ordered loft sections");
    this.shape.setAttribute("aria-label", "Loft shape");
    for (const name of ["Smooth", "Ruled"]) {
      const option = document.createElement("option");
      option.textContent = name;
      option.value = name.toLowerCase();
      this.shape.append(option);
    }
    this.shape.onchange = change;
    for (const mode of ["union", "subtract", "intersect", "new"] as const) {
      const button = this.button(
        mode === "new" ? "New body" : mode[0].toUpperCase() + mode.slice(1),
        "",
      );
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${modeIcons[mode]}</svg>`;
      button.dataset.mode = mode;
      button.onclick = () => setMode(mode);
      this.modes.append(button);
    }
    this.modes.className = "loft-modes";
    this.modes.append(this.accept, this.cancel);
    const heading = document.createElement("strong");
    heading.textContent = "Loft";
    const options = document.createElement("div");
    options.className = "loft-options";
    options.append(this.add, this.shape, this.automatic);
    this.root.append(heading, this.sections, options, this.modes);
  }
  private button(label: string, text: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.setAttribute("aria-label", label);
    button.title = label;
    button.textContent = text;
    return button;
  }
  update(
    editor: SketchEditor,
    sources: LiftSource[],
    alignment: number[] | undefined,
    collecting: boolean,
    valid: boolean,
    mode: Loft["mode"],
  ): void {
    const key = JSON.stringify([sources, alignment]);
    if (this.key !== key) {
      this.key = key;
      this.sections.replaceChildren();
      sources.forEach((source, index) => {
        const row = document.createElement("li");
        const label = document.createElement("span");
        const sketchIndex =
          "sketch" in source
            ? editor.store.data.sketches.findIndex((s) => s.id === source.sketch)
            : -1;
        label.textContent =
          sketchIndex >= 0
            ? (editor.store.data.entityPresentation?.find(
                (entry) => entry.id === editor.store.data.sketches[sketchIndex].id,
              )?.name ?? `Sketch ${sketchIndex + 1}`)
            : "Planar face";
        if ("face" in source) {
          const bodyIndex =
            editor.store.data.bodies?.findIndex((b) => b.faces.some((f) => f.id === source.face)) ??
            -1;
          const faceIndex =
            editor.store.data.bodies?.[bodyIndex].faces.findIndex((f) => f.id === source.face) ??
            -1;
          label.textContent = `Body ${bodyIndex + 1} · face ${faceIndex + 1}`;
        }
        label.title = label.textContent;
        row.append(label);
        for (const [action, text, name] of [
          ["up", "↑", "Move section up"],
          ["down", "↓", "Move section down"],
          ["previous", "↶", "Previous alignment"],
          ["next", "↷", "Next alignment"],
          ["remove", "×", "Remove section"],
        ] as const) {
          const button = this.button(`${name} ${index + 1}`, text);
          button.dataset.action = action;
          button.disabled =
            (action === "up" && index === 0) || (action === "down" && index === sources.length - 1);
          button.onclick = () => this.sectionAction(index, action);
          row.append(button);
        }
        const seam = document.createElement("small");
        seam.textContent = alignment ? `Seam ${alignment[index]}` : "Auto";
        row.append(seam);
        this.sections.append(row);
      });
    }
    [...this.sections.children].forEach((row, index) => {
      for (const button of row.querySelectorAll<HTMLButtonElement>("button"))
        button.disabled =
          editor.blocked ||
          (button.dataset.action === "up" && index === 0) ||
          (button.dataset.action === "down" && index === sources.length - 1);
    });
    this.add.textContent = collecting ? "Done adding" : "+ Sections";
    this.add.setAttribute("aria-pressed", String(collecting));
    this.accept.disabled = !valid || editor.blocked || collecting;
    for (const button of this.modes.querySelectorAll<HTMLButtonElement>("[data-mode]"))
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    for (const control of this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      "button:not([data-action]), select",
    ))
      if (control !== this.accept && control !== this.cancel) control.disabled = editor.blocked;
    this.place(editor, sources[0]);
  }
  private place(editor: SketchEditor, source: LiftSource | undefined): void {
    let position = { x: innerWidth / 2, y: innerHeight / 2 };
    if (source && "sketch" in source) {
      const sketch = editor.store.data.sketches.find((s) => s.id === source.sketch);
      const region = sketch && profilesFor(sketch).find((p) => p.key === source.profile);
      if (sketch && region) {
        const points = boundaryPoints(region.outer, 0.05);
        const center = points.reduce(
          (sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }),
          { x: 0, y: 0 },
        );
        position = editor.world.project(worldPoint(sketch.plane, center));
      }
    } else if (source && "face" in source) {
      const face = editor.store.data.bodies
        ?.flatMap((b) => b.faces)
        .find((f) => f.id === source.face);
      if (face?.plane) position = editor.world.project(face.plane.origin);
    }
    const x = Math.max(12, Math.min(innerWidth - 370, position.x + 65));
    const y = Math.max(85, Math.min(innerHeight - this.root.offsetHeight - 20, position.y + 30));
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
    this.placement.fit([this.root]);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
