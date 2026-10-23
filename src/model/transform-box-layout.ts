import type { Vector } from "../sketch/planes.js";
import type { BoxHandle, TransformBox } from "./transform-box.js";

type Point = { x: number; y: number };

/** A box boundary is visible if any incident face faces the orthographic camera. */
export function boxHandleVisible(
  box: TransformBox,
  handle: BoxHandle,
  towardCamera: Vector,
): boolean {
  if (box.frame || box.max.some((value, axis) => value - box.min[axis] <= 1e-8)) return true;
  return handle.axes.some((axis) => {
    const sign = handle.point[axis] === box.min[axis] ? -1 : 1;
    return sign * towardCamera[axis] > 1e-8;
  });
}

export function projectedHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (sequence: Point[]) => {
    const result: Point[] = [];
    for (const point of sequence) {
      while (
        result.length > 1 &&
        cross(result[result.length - 2], result[result.length - 1], point) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** Extend the control's ray beyond the box silhouette, including its hit radius. */
export function outsideBoxRatio(tip: Point, hull: readonly Point[], radius: number): number {
  if (hull.length < 3 || Math.hypot(tip.x, tip.y) < 1e-8) return 1;
  let enter = -Infinity,
    exit = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i],
      b = hull[(i + 1) % hull.length];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (b.y - a.y) / length,
      ny = (a.x - b.x) / length;
    const limit = nx * a.x + ny * a.y + radius;
    const slope = nx * tip.x + ny * tip.y;
    if (Math.abs(slope) < 1e-8) {
      if (limit < 0) return 1;
    } else if (slope > 0) exit = Math.min(exit, limit / slope);
    else enter = Math.max(enter, limit / slope);
  }
  return enter <= 1 && exit >= 1 && Number.isFinite(exit) ? exit + 1e-6 : 1;
}
