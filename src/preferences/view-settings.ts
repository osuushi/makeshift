import { resetViewDisplay, setViewDisplay, viewDisplay } from "./view-display.js";

export function viewSettings(): HTMLElement {
  const section = document.createElement("section");
  section.className = "view-display-settings";
  section.innerHTML = "<h3>Grid display</h3>";
  const rows = (["grid", "gridFill", "gridLineWidth"] as const).map((field) => {
    const thickness = field === "gridLineWidth";
    const title = thickness
      ? "Grid line thickness"
      : field === "gridFill"
        ? "Grid fill opacity"
        : "Grid opacity";
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
  const update = () => {
    const value = viewDisplay();
    for (const row of rows) {
      row.input.value = String(Math.round(value[row.field] * (row.thickness ? 10 : 1000)) / 10);
      row.output.textContent = `${row.input.value}${row.thickness ? " px" : "%"}`;
    }
  };
  section.addEventListener("preferences-refresh", update);
  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "Reset grid display";
  reset.onclick = () => {
    resetViewDisplay();
    update();
  };
  section.querySelector("h3")?.append(reset);
  update();
  return section;
}
