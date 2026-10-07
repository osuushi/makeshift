import { type PlaneId, planeIds } from "../sketch/planes.js";

export interface CanonicalPlaneSettings {
  /** Absolute view-direction dot normal where visibility starts. */
  angleCutoff: number;
  fadeWidth: number;
  /** Fractions of configured full visibility, independent of fill/grid opacity. */
  selectableMinimum: number;
  fullOpacityAbove: number;
  fadeMilliseconds: number;
  colors: Record<PlaneId, string>;
  palettes: Record<string, Record<PlaneId, string>>;
}
export const planePresets = {
  focused: { angleCutoff: 0.45, fadeWidth: 0.3 },
  choice: { angleCutoff: 0.25, fadeWidth: 0.4 },
} as const;
export const defaultPlaneColors = { XY: "#8fa8c4", XZ: "#91b5a4", YZ: "#c2a27b" };
const defaults: CanonicalPlaneSettings = {
  ...planePresets.focused,
  selectableMinimum: 0.15,
  fullOpacityAbove: 1,
  fadeMilliseconds: 120,
  colors: defaultPlaneColors,
  palettes: {},
};
const key = "makeshift.canonical-planes";
const listeners = new Set<() => void>();
let value = normalizePlaneSettings(null);
try {
  value = normalizePlaneSettings(JSON.parse(localStorage.getItem(key) ?? "null"));
} catch {
  // Storage is optional.
}
function colors(input: unknown): Record<PlaneId, string> {
  const result = { ...defaultPlaneColors };
  if (input && typeof input === "object")
    for (const id of planeIds) {
      const color = (input as Record<string, unknown>)[id];
      if (typeof color === "string" && /^#[\da-f]{6}$/i.test(color)) result[id] = color;
    }
  return result;
}
export function normalizePlaneSettings(input: unknown): CanonicalPlaneSettings {
  const result = { ...defaults, colors: { ...defaultPlaneColors }, palettes: {} };
  if (!input || typeof input !== "object") return result;
  const candidate = input as Partial<CanonicalPlaneSettings>;
  for (const field of [
    "angleCutoff",
    "fadeWidth",
    "selectableMinimum",
    "fullOpacityAbove",
    "fadeMilliseconds",
  ] as const) {
    const number = candidate[field];
    if (typeof number === "number" && Number.isFinite(number))
      result[field] = Math.max(0, Math.min(field === "fadeMilliseconds" ? 2000 : 1, number));
  }
  result.colors = colors(candidate.colors);
  if (candidate.palettes && typeof candidate.palettes === "object")
    result.palettes = Object.fromEntries(
      Object.entries(candidate.palettes)
        .filter(([name]) => name.trim().length > 0 && name.length <= 60)
        .slice(0, 30)
        .map(([name, palette]) => [name, colors(palette)]),
    );
  return result;
}
export function canonicalPlanes(): CanonicalPlaneSettings {
  return structuredClone(value);
}
export function setCanonicalPlanes(patch: Partial<CanonicalPlaneSettings>): void {
  value = normalizePlaneSettings({ ...value, ...patch });
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep window-local preferences.
  }
  for (const listener of listeners) listener();
}
export function resetCanonicalPlanes(): void {
  setCanonicalPlanes({ ...defaults, palettes: value.palettes });
}
export function onCanonicalPlanesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
