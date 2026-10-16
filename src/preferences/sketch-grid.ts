import { defaultSketchGrid, type SketchGrid, validateSketchGrid } from "../sketch/grid-settings.js";

const key = "makeshift.sketch-grid";
let cached: { grid: SketchGrid; minPixels: number } | undefined;
const listeners = new Set<() => void>();
export function sketchGridPreferences(): { grid: SketchGrid; minPixels: number } {
  if (!cached) {
    cached = { grid: { ...defaultSketchGrid }, minPixels: 4 };
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "null");
      if (stored) {
        validateSketchGrid(stored.grid);
        validateMinimum(stored.minPixels);
        cached = stored;
      }
    } catch {
      /* Storage is optional; malformed preferences use built-in defaults. */
    }
  }
  return structuredClone(cached ?? { grid: { ...defaultSketchGrid }, minPixels: 4 });
}
export function saveSketchGridDefaults(grid: SketchGrid): void {
  validateSketchGrid(grid);
  save({ ...sketchGridPreferences(), grid: { ...grid } });
}
export function setGridMinimum(minPixels: number): void {
  validateMinimum(minPixels);
  save({ ...sketchGridPreferences(), minPixels });
}
function validateMinimum(value: number): void {
  if (!Number.isFinite(value) || value < 1 || value > 1000)
    throw new Error("Minimum grid size must be between 1 and 1000 pixels.");
}
function save(value: { grid: SketchGrid; minPixels: number }): void {
  cached = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep this window's choice. */
  }
  for (const listener of listeners) listener();
}
export function onSketchGridPreferencesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
