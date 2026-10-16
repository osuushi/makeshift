import { saveSketchGridDefaults, setGridMinimum, sketchGridPreferences } from "./sketch-grid.js";
import { sketchGridFields } from "./sketch-grid-fields.js";

export function sketchGridSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  const heading = document.createElement("h3");
  heading.textContent = "Sketch grid defaults";
  const fields = sketchGridFields(() => sketchGridPreferences().grid, saveSketchGridDefaults);
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
    "Grid defaults apply to new documents. Minimum pixels applies to every sketch view. Snapping follows the visible grid.";
  section.append(heading, fields.root, label, note);
  const update = () => {
    fields.update();
    minimum.value = String(sketchGridPreferences().minPixels);
  };
  section.addEventListener("preferences-refresh", update);
  update();
  return section;
}
