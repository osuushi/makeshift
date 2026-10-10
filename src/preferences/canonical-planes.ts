import { type PlaneId, planeIds } from "../sketch/planes.js";

export interface CanonicalPlaneSettings {
  /** Switch when the view is this many degrees from the current plane's surface. */
  switchAngleDegrees: number;
  /** Absolute view-direction dot normal where visibility starts. */
  angleCutoff: number;
  fadeWidth: number;
  /** Fractions of configured full visibility, independent of fill/grid opacity. */
  selectableMinimum: number;
  fullOpacityAbove: number;
  fadeMilliseconds: number;
  /** Legacy preference retained for compatibility; secondary grids are disabled. */
  secondaryOpacity: number;
  colors: Record<PlaneId, string>;
  palettes: Record<string, Record<PlaneId, string>>;
}
export const planePresets = {
  focused: { angleCutoff: 0.45, fadeWidth: 0.3 },
  choice: { angleCutoff: 0.25, fadeWidth: 0.4 },
} as const;
export const defaultPlaneColors = { XY: "#d4ae3a", XZ: "#55bb6e", YZ: "#b325c1" };
export const defaultSecondaryOpacity = 0;
const defaults: CanonicalPlaneSettings = {
  switchAngleDegrees: 30,
  ...planePresets.focused,
  selectableMinimum: 0.15,
  fullOpacityAbove: 1,
  fadeMilliseconds: 240,
  secondaryOpacity: defaultSecondaryOpacity,
  colors: defaultPlaneColors,
  palettes: {},
};
const key = "makeshift.canonical-planes";
const gridSettingsKey = "makeshift.plane-grids-version";
const listeners = new Set<() => void>();
let value = normalizePlaneSettings(null);
try {
  value = normalizePlaneSettings(JSON.parse(localStorage.getItem(key) ?? "null"));
  if (localStorage.getItem(gridSettingsKey) !== "1") {
    value = {
      ...value,
      ...planePresets.focused,
      selectableMinimum: 0.15,
      fullOpacityAbove: 1,
      fadeMilliseconds: defaults.fadeMilliseconds,
    };
    const oldColors = { XY: "#8fa8c4", XZ: "#91b5a4", YZ: "#c2a27b" };
    for (const id of planeIds)
      if (value.colors[id] === oldColors[id]) value.colors[id] = defaultPlaneColors[id];
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem(gridSettingsKey, "1");
  }
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
    "switchAngleDegrees",
    "angleCutoff",
    "fadeWidth",
    "selectableMinimum",
    "fullOpacityAbove",
    "fadeMilliseconds",
    "secondaryOpacity",
  ] as const) {
    const number = candidate[field];
    if (typeof number === "number" && Number.isFinite(number))
      result[field] = Math.max(
        0,
        Math.min(
          field === "fadeMilliseconds" ? 2000 : field === "switchAngleDegrees" ? 90 : 1,
          number,
        ),
      );
  }
  // Upgrade the old implicit fade default while retaining custom durations.
  if (candidate.secondaryOpacity === undefined && candidate.fadeMilliseconds === 120)
    result.fadeMilliseconds = defaults.fadeMilliseconds;
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
