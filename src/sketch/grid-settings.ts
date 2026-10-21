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
  const minimum = minPixels / pixelsPerMm;
  const major = grid.major * Math.max(1, Math.ceil(minimum / grid.major - 1e-12));
  const ratio = major / grid.minor;
  const count = Math.round(ratio);
  let minor = major;
  // Thin minor lines only at subdivisions of the configured major lattice.
  // Incommensurate settings retain the major grid instead of moving its lines.
  if (Math.abs(ratio - count) < 1e-8) {
    for (let divisor = 1; divisor * divisor <= count; divisor++) {
      if (count % divisor) continue;
      for (const stride of [divisor, count / divisor]) {
        const spacing = grid.minor * stride;
        if (spacing >= minimum - 1e-12 && spacing < minor) minor = spacing;
      }
    }
  }
  return { minor, major, hideMinor: minor === major, snap: minor };
}
