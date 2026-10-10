import {
  type CanonicalPlaneSettings,
  canonicalPlanes,
  setCanonicalPlanes,
} from "./canonical-planes.js";
import { setViewDisplay, type ViewDisplay, viewDisplay } from "./view-display.js";

export interface ApplicationPreferences {
  canonicalPlanes: CanonicalPlaneSettings;
  viewDisplay: ViewDisplay;
}
export type ApplicationPreferencesPatch = {
  canonicalPlanes?: Partial<CanonicalPlaneSettings>;
  viewDisplay?: Partial<ViewDisplay>;
};
export function applicationPreferences(): ApplicationPreferences {
  return { canonicalPlanes: canonicalPlanes(), viewDisplay: viewDisplay() };
}
/** Validate the entire agent patch before changing any device preference. */
export function configurePreferences(json: string): void {
  const patch = JSON.parse(json) as ApplicationPreferencesPatch;
  object(patch, ["canonicalPlanes", "viewDisplay"]);
  if (patch.viewDisplay !== undefined) {
    object(patch.viewDisplay, ["planes", "grid", "gridFill", "gridLineWidth"]);
    for (const [field, value] of Object.entries(patch.viewDisplay)) {
      number(value, field === "gridLineWidth" ? 3 : 1);
      if (field === "gridLineWidth" && value < 0.5)
        throw new Error("Grid line thickness must be at least 0.5 pixels.");
    }
  }
  if (patch.canonicalPlanes !== undefined) {
    const planes = patch.canonicalPlanes;
    object(planes, [
      "angleCutoff",
      "fadeWidth",
      "selectableMinimum",
      "fullOpacityAbove",
      "fadeMilliseconds",
      "secondaryOpacity",
      "colors",
      "palettes",
    ]);
    for (const [field, value] of Object.entries(planes)) {
      if (field === "colors") palette(value);
      else if (field === "palettes") {
        object(value);
        if (Object.keys(value).length > 30) throw new Error("At most 30 palettes can be saved.");
        for (const [name, colors] of Object.entries(value)) {
          if (!name.trim() || name.length > 60)
            throw new Error("Palette names must be 1–60 characters.");
          palette(colors);
        }
      } else number(value, field === "fadeMilliseconds" ? 2000 : 1);
    }
  }
  if (patch.viewDisplay) setViewDisplay({ ...viewDisplay(), ...patch.viewDisplay });
  if (patch.canonicalPlanes) setCanonicalPlanes(patch.canonicalPlanes);
}
function object(
  value: unknown,
  fields?: readonly string[],
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Settings must be an object.");
  if (fields && Object.keys(value).some((key) => !fields.includes(key)))
    throw new Error("Unknown settings field.");
}
function number(value: unknown, max: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max)
    throw new Error(`Setting must be a finite number between 0 and ${max}.`);
}
function palette(value: unknown): void {
  object(value, ["XY", "XZ", "YZ"]);
  if (
    ["XY", "XZ", "YZ"].some(
      (id) => typeof value[id] !== "string" || !/^#[\da-f]{6}$/i.test(value[id] as string),
    )
  )
    throw new Error("Palettes require XY, XZ and YZ hexadecimal colors (#rrggbb).");
}
