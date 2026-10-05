import type { DecoratorField, Settings } from "./types.js";

export const threadDefinition = "freac.threads";
export interface ThreadSettings extends Settings {
  preset: "fdm-fine" | "fdm-coarse" | "metric" | "custom";
  pitch: number;
  profile: "triangle" | "metric" | "rounded";
  hand: "right" | "left";
  cut: "rod" | "hole";
  clearance: number;
  tipTruncation: number;
  start: number;
  end: number;
  startTaper: number;
  endTaper: number;
}

export const threadFields: readonly DecoratorField[] = [
  {
    key: "preset",
    label: "Preset",
    type: "enum",
    options: [
      { value: "fdm-fine", label: "FDM fine" },
      { value: "fdm-coarse", label: "FDM coarse" },
      { value: "metric", label: "Metric" },
      { value: "custom", label: "Custom" },
    ],
  },
  { key: "pitch", label: "Pitch", type: "number", unit: "mm", min: 0.05, max: 100 },
  {
    key: "profile",
    label: "Profile",
    type: "enum",
    options: [
      { value: "triangle", label: "FDM triangle · 1 mm envelope" },
      { value: "metric", label: "Metric 60°" },
      { value: "rounded", label: "Rounded" },
    ],
  },
  {
    key: "hand",
    label: "Handedness",
    type: "enum",
    options: [
      { value: "right", label: "Right" },
      { value: "left", label: "Left" },
    ],
  },
  {
    key: "cut",
    label: "Cut into",
    type: "enum",
    options: [
      { value: "rod", label: "Rod" },
      { value: "hole", label: "Hole" },
    ],
  },
  { key: "clearance", label: "Clearance", type: "number", unit: "mm", min: 0, max: 10 },
  {
    key: "tipTruncation",
    label: "Tip truncation",
    type: "number",
    unit: "mm",
    min: 0,
    max: 0.49,
    default: 0,
    visibleWhen: { key: "profile", values: ["triangle"] },
  },
  { key: "start", label: "Start inset", type: "number", unit: "mm", min: 0 },
  { key: "end", label: "End inset", type: "number", unit: "mm", min: 0 },
  { key: "startTaper", label: "Start taper", type: "number", unit: "mm", min: 0 },
  { key: "endTaper", label: "End taper", type: "number", unit: "mm", min: 0 },
];

// Optional compatibility metadata; neither required nor exposed as current controls.
const legacyPrinterFields: readonly DecoratorField[] = [
  {
    key: "layerHeight",
    label: "Layer height",
    type: "number",
    unit: "mm",
    min: 0.01,
    max: 5,
  },
  {
    key: "nozzleDiameter",
    label: "Nozzle diameter",
    type: "number",
    unit: "mm",
    min: 0.05,
    max: 10,
  },
];

function legacyPreset(value: Settings[string]): boolean {
  return value === "print-upright" || value === "print-sideways";
}

/** Rename only: never re-resolve the dimensions saved by an older orientation preset. */
export function normalizeThreadPreset(settings: Settings): Settings {
  return legacyPreset(settings.preset) ? { ...settings, preset: "custom" } : settings;
}

// ISO metric coarse nominal diameter/pitch pairs; tie goes to the smaller diameter.
// Reference table: https://sg.misumi-ec.com/tech-info/categories/technical_data/td01/a0063.html
const coarse = [
  [1, 0.25],
  [1.2, 0.25],
  [1.4, 0.3],
  [1.6, 0.35],
  [1.8, 0.35],
  [2, 0.4],
  [2.5, 0.45],
  [3, 0.5],
  [3.5, 0.6],
  [4, 0.7],
  [5, 0.8],
  [6, 1],
  [7, 1],
  [8, 1.25],
  [10, 1.5],
  [12, 1.75],
  [14, 2],
  [16, 2],
  [18, 2.5],
  [20, 2.5],
  [22, 2.5],
  [24, 3],
  [27, 3],
  [30, 3.5],
  [33, 3.5],
  [36, 4],
  [39, 4],
  [42, 4.5],
  [45, 4.5],
  [48, 5],
  [52, 5],
  [56, 5.5],
  [60, 5.5],
  [64, 6],
];

export function coarseMetric(diameter: number) {
  const nearest = coarse.reduce((a, b) =>
    Math.abs(b[0] - diameter) < Math.abs(a[0] - diameter) ? b : a,
  );
  return {
    diameter: nearest[0],
    pitch: nearest[1],
    listed: Math.abs(diameter - nearest[0]) < 1e-7,
  };
}

/** FDM triangles keep a 1 mm radial envelope before clipping either tip. */
export function threadDepth(settings: ThreadSettings): number {
  return settings.profile === "triangle" ? 1 : (settings.pitch * Math.sqrt(3) * 5) / 16;
}

export function threadDefaults(
  diameter: number,
  preset: ThreadSettings["preset"] = "fdm-fine",
): ThreadSettings {
  const fdm = preset === "fdm-fine" || preset === "fdm-coarse";
  return {
    preset,
    pitch: fdm ? (preset === "fdm-fine" ? 1 : 1.5) : coarseMetric(diameter).pitch,
    profile: fdm ? "triangle" : "metric",
    hand: "right",
    cut: "rod",
    clearance: preset === "fdm-fine" ? 0.25 : 0.1,
    tipTruncation: fdm ? 0.1 : 0,
    start: 0,
    end: 0,
    startTaper: 0,
    endTaper: 0,
  };
}

export function threadSettings(settings: Settings): ThreadSettings {
  const normalized: Settings = {
    tipTruncation: 0,
    ...normalizeThreadPreset(settings),
  };
  const fields = [...threadFields, ...legacyPrinterFields];
  for (const field of fields) {
    const value = normalized[field.key];
    if (legacyPrinterFields.includes(field) && value === undefined) continue;
    if (field.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < (field.min ?? -Infinity) ||
        value > (field.max ?? Infinity)
      )
        throw new Error(`Invalid thread ${field.label.toLowerCase()}`);
    } else if (!field.options?.some((option) => option.value === value))
      throw new Error(`Invalid thread ${field.label.toLowerCase()}`);
  }
  if (Object.keys(settings).some((key) => !fields.some((field) => field.key === key)))
    throw new Error("Unknown thread setting");
  return normalized as ThreadSettings;
}

/** Resolve a preset only when explicitly chosen, never on geometry or metadata edits. */
export function patchThreadSettings(
  diameter: number,
  settings: Settings,
  patch: Settings,
): ThreadSettings {
  if (legacyPreset(patch.preset)) throw new Error("This thread preset is no longer available");
  const merged = threadSettings({ ...threadSettings(settings), ...patch });
  let resolved = merged;
  if (patch.preset && patch.preset !== "custom") {
    const { pitch, profile, clearance, tipTruncation } = threadDefaults(diameter, merged.preset);
    resolved = threadSettings({ ...merged, pitch, profile, clearance, tipTruncation, ...patch });
  }
  if (resolved.preset === "fdm-fine" || resolved.preset === "fdm-coarse") {
    const defaults = threadDefaults(diameter, resolved.preset);
    if (
      resolved.pitch !== defaults.pitch ||
      resolved.profile !== defaults.profile ||
      resolved.tipTruncation !== defaults.tipTruncation
    )
      return threadSettings({ ...resolved, preset: "custom" });
  }
  return resolved;
}
