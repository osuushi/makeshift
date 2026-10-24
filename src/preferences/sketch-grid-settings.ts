import { saveSketchGridDefaults, setGridMinimum, sketchGridPreferences } from "./sketch-grid.js";
import { sketchGridFields } from "./sketch-grid-fields.js";

export function sketchGridSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  const heading = document.createElement("h3");
  heading.textContent = "Sketch grid defaults";
  const fields = sketchGridFields(() => sketchGridPreferences().grid, saveSketchGridDefaults);
  groupGridFields(fields.root);
  const label = document.createElement("label");
  label.textContent = "Min pixels per grid square";
  const minimum = document.createElement("input");
  minimum.type = "number";
  minimum.min = "1";
  minimum.max = "1000";
  minimum.step = "any";
  minimum.required = true;
  minimum.setAttribute("aria-label", label.textContent);
  minimum.onchange = () => {
    if (minimum.reportValidity()) setGridMinimum(minimum.valueAsNumber);
  };
  label.append(minimum);
  const note = document.createElement("p");
  note.textContent =
    "Grid defaults apply to new drawings. Minimum pixels applies to every sketch view.";
  section.append(heading, fields.root, label, note);
  const update = () => {
    fields.update();
    minimum.value = String(sketchGridPreferences().minPixels);
  };
  section.addEventListener("preferences-refresh", update);
  update();
  return section;
}

function groupGridFields(root: HTMLElement): void {
  const labels = [...root.querySelectorAll("label")];
  for (const [offset, title] of [
    [0, "Minor grid"],
    [2, "Major grid"],
  ] as const) {
    const pair = document.createElement("div");
    pair.className = "settings-grid-pair";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const spacing = labels[offset],
      color = labels[offset + 1];
    if (spacing.firstChild) spacing.firstChild.textContent = "Spacing (mm)";
    if (color.firstChild) color.firstChild.textContent = "Color";
    pair.append(heading, spacing, color);
    root.insertBefore(pair, labels[4]);
  }
}
