/** Document-owned sketch grid; distances are millimetres. */
export interface SketchGrid {
  minor: number;
  major: number;
  minorColor: string;
  majorColor: string;
  snap: boolean;
}
export const defaultSketchGrid: Readonly<SketchGrid> = {
  minor: 0.5,
  major: 10,
  minorColor: "#b8c2cf",
  majorColor: "#758296",
  snap: true,
};

export function validateSketchGrid(value: unknown): asserts value is SketchGrid {
  const grid = value as SketchGrid | null;
  if (
    !grid ||
    ![grid.minor, grid.major].every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0.000001 && n <= 1000000,
    ) ||
    ![grid.minorColor, grid.majorColor].every(
      (color) => typeof color === "string" && /^#[\da-f]{6}$/i.test(color),
    ) ||
    typeof grid.snap !== "boolean"
  )
    throw new Error("Grid requires positive spacings (0.000001–1000000 mm), colors and snapping.");
}

export function visibleSketchGrid(grid: SketchGrid, pixelsPerMm: number, minPixels: number) {
  const minor = grid.minor * Math.max(1, Math.ceil(minPixels / (grid.minor * pixelsPerMm) - 1e-12));
  // Derive major lines from the visible minor grid so every major line aligns.
  const major = minor * Math.max(1, Math.ceil(grid.major / minor - 1e-12));
  const hideMinor = minor === major;
  return { minor, major, hideMinor, snap: minor };
}
