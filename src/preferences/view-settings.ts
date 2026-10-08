import {
  canonicalPlanes,
  defaultSecondaryOpacity,
  setCanonicalPlanes,
} from "./canonical-planes.js";
import { resetViewDisplay, setViewDisplay, viewDisplay } from "./view-display.js";

export function viewSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  section.innerHTML = "<h3>Grid display</h3>";
  const rows = (["grid", "gridLineWidth"] as const).map((field) => {
    const thickness = field === "gridLineWidth";
    const title = thickness ? "Grid line thickness" : "Grid opacity";
    const row = document.createElement("label");
    row.innerHTML = `<span>${title}</span><input type="range" min="${thickness ? 0.5 : 0}" max="${thickness ? 3 : 100}" step="0.1" aria-label="${title}"><output></output>`;
    const input = row.querySelector("input");
    const output = row.querySelector("output");
    if (!input || !output) throw new Error("Missing viewport opacity controls");
    input.oninput = () => {
      setViewDisplay({ ...viewDisplay(), [field]: Number(input.value) / (thickness ? 1 : 100) });
      output.textContent = `${input.value}${thickness ? " px" : "%"}`;
    };
    section.append(row);
    return { field, input, output, thickness };
  });
  const secondary = document.createElement("label");
  secondary.innerHTML =
    '<span>Secondary plane opacity</span><input type="range" min="0" max="100" step="1" aria-label="Secondary plane opacity"><output></output>';
  secondary.title = "Relative to the primary grid opacity";
  const secondaryInput = secondary.querySelector("input");
  const secondaryOutput = secondary.querySelector("output");
  if (!secondaryInput || !secondaryOutput) throw new Error("Missing secondary plane control");
  secondaryInput.oninput = () => {
    setCanonicalPlanes({ secondaryOpacity: Number(secondaryInput.value) / 100 });
    secondaryOutput.textContent = `${secondaryInput.value}%`;
  };
  section.append(secondary);
  const update = () => {
    const value = viewDisplay();
    for (const row of rows) {
      row.input.value = String(Math.round(value[row.field] * (row.thickness ? 10 : 1000)) / 10);
      row.output.textContent = `${row.input.value}${row.thickness ? " px" : "%"}`;
    }
    secondaryInput.value = String(Math.round(canonicalPlanes().secondaryOpacity * 100));
    secondaryOutput.textContent = `${secondaryInput.value}%`;
  };
  section.addEventListener("preferences-refresh", update);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset grid display";
  reset.onclick = () => {
    resetViewDisplay();
    setCanonicalPlanes({ secondaryOpacity: defaultSecondaryOpacity });
    update();
  };
  section.querySelector("h3")?.append(reset);
  update();
  return section;
}
