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
  const clamp = (spacing: number) =>
    spacing * Math.max(1, Math.ceil(minPixels / (spacing * pixelsPerMm) - 1e-12));
  const minor = clamp(grid.minor);
  const major = clamp(grid.major);
  const hideMinor = minor === major || (minor > major && shareGridFactor(minor, major));
  return { minor, major, hideMinor, snap: hideMinor ? major : Math.min(minor, major) };
}

/** Compare decimal spacings in their smallest shared power-of-ten unit. */
function shareGridFactor(a: number, b: number): boolean {
  for (let scale = 1; scale <= 1e6; scale *= 10) {
    const x = Math.round(a * scale);
    const y = Math.round(b * scale);
    if (Math.abs(a * scale - x) > 1e-7 || Math.abs(b * scale - y) > 1e-7) continue;
    let divisor = x;
    let remainder = y;
    while (remainder) [divisor, remainder] = [remainder, divisor % remainder];
    return divisor > 1;
  }
  return false;
}
