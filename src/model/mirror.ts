import type { Point, Vector } from "../sketch/planes.js";

export interface MirrorPlane {
  origin: Vector;
  normal: Vector;
}
export interface MirrorLine {
  origin: Point;
  direction: Point;
}
export type MirrorOperation =
  | {
      kind: "bodies";
      ids: string[];
      smartObjectIds?: string[];
      plane: MirrorPlane;
      keepOriginal: boolean;
    }
  | { kind: "sketch"; sketchId: string; ids: string[]; line: MirrorLine; keepOriginal: boolean };

export function reflectPoint(point: Point, line: MirrorLine): Point {
  const { origin: o, direction: d } = line;
  const length = Math.hypot(d.x, d.y);
  if (![o.x, o.y, d.x, d.y].every(Number.isFinite) || length < 1e-10)
    throw new Error("Choose a nonzero mirror line");
  const x = d.x / length,
    y = d.y / length;
  const distance = (point.x - o.x) * -y + (point.y - o.y) * x;
  return { x: point.x + 2 * distance * y, y: point.y - 2 * distance * x };
}
