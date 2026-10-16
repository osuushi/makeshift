import type { SketchGrid } from "../sketch/grid-settings.js";

/** Shared controls for document grid and new-document defaults. */
export function sketchGridFields(read: () => SketchGrid, change: (grid: SketchGrid) => void) {
  const root = document.createElement("fieldset");
  root.className = "sketch-grid-fields";
  root.innerHTML = `<legend>Sketch grid</legend>
    <label>Minor grid (mm)<input aria-label="Minor grid (mm)" name="minor" type="number" min="0.000001" max="1000000" step="any" required></label>
    <label>Minor color<input aria-label="Minor grid color" name="minorColor" type="color"></label>
    <label>Major grid (mm)<input aria-label="Major grid (mm)" name="major" type="number" min="0.000001" max="1000000" step="any" required></label>
    <label>Major color<input aria-label="Major grid color" name="majorColor" type="color"></label>
    <label>Snap to grid<input aria-label="Snap to grid" name="snap" type="checkbox"></label>`;
  const inputs = [...root.querySelectorAll("input")];
  const update = () => {
    const grid = read();
    for (const input of inputs) {
      if (document.activeElement === input) continue;
      if (input.name === "snap") input.checked = grid.snap;
      else input.value = String(grid[input.name as keyof SketchGrid]);
    }
  };
  for (const input of inputs)
    input.onchange = () => {
      if (!input.reportValidity()) return;
      const value =
        input.type === "checkbox"
          ? input.checked
          : input.type === "number"
            ? input.valueAsNumber
            : input.value;
      change({ ...read(), [input.name]: value });
    };
  update();
  return { root, update };
}
