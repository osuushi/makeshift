import { resetViewDisplay, setViewDisplay, viewDisplay } from "./view-display.js";

export function viewSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  section.innerHTML = "<h3>Viewport opacity</h3>";
  const rows = (["planes", "grid"] as const).map((field) => {
    const title = field === "planes" ? "Canonical planes" : "Grid";
    const row = document.createElement("label");
    row.innerHTML = `<span>${title}</span><input type="range" min="0" max="100" step="0.1" aria-label="${title} opacity"><output></output>`;
    const input = row.querySelector("input");
    const output = row.querySelector("output");
    if (!input || !output) throw new Error("Missing viewport opacity controls");
    input.oninput = () => {
      setViewDisplay({ ...viewDisplay(), [field]: Number(input.value) / 100 });
      output.textContent = `${input.value}%`;
    };
    section.append(row);
    return { field, input, output };
  });
  const update = () => {
    const value = viewDisplay();
    for (const row of rows) {
      row.input.value = String(Math.round(value[row.field] * 1000) / 10);
      row.output.textContent = `${row.input.value}%`;
    }
  };
  section.addEventListener("preferences-refresh", update);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset viewport opacity";
  reset.onclick = () => {
    resetViewDisplay();
    update();
  };
  section.append(reset);
  update();
  return section;
}
