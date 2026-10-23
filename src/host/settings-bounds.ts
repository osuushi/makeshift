import type { SettingsSize } from "../preferences/settings-size.js";

interface Size {
  width: number;
  height: number;
}
interface Bounds extends Size {
  x: number;
  y: number;
}
const tabs = ["Interface", "Sketch Grid", "View", "Decorators", "Experimental", "Toolbox"];

export function readSettingsSize(input: unknown): SettingsSize {
  const value = input as Partial<SettingsSize> | null;
  if (!value || typeof value.tab !== "string" || !tabs.includes(value.tab))
    throw new Error("Unknown Settings tab");
  for (const key of ["width", "height", "minimumHeight", "maximumHeight"] as const)
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0)
      throw new Error("Invalid measured Settings size");
  const size = value as SettingsSize;
  if (size.minimumHeight > size.height || size.height > size.maximumHeight)
    throw new Error("Invalid measured Settings height limits");
  return size;
}

/** Measurements are CSS pixels at the current scale; add native chrome once. */
export function settingsTabBounds(
  measured: SettingsSize,
  current: Bounds,
  frame: Size,
  work: Bounds,
): { preferred: Bounds; min: Size; max: Size; resizable: boolean } {
  const resizable = measured.tab === "Toolbox";
  const width = Math.min(work.width, Math.ceil(measured.width + frame.width));
  const height = (value: number) => Math.min(work.height, Math.ceil(value + frame.height));
  const preferred = { width, height: height(measured.height) };
  return {
    resizable,
    min: { width, height: height(resizable ? measured.minimumHeight : measured.height) },
    max: {
      width,
      height: height(resizable ? measured.maximumHeight : measured.height),
    },
    preferred: {
      ...preferred,
      x: Math.max(work.x, Math.min(current.x, work.x + work.width - preferred.width)),
      y: Math.max(work.y, Math.min(current.y, work.y + work.height - preferred.height)),
    },
  };
}
