import type { Face } from "../model/body.js";
import type { Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";

type Point = { across: number; axial: number };

function clip(points: Point[], bound: number, sign: number): Point[] {
  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const insideA = sign * (a.axial - bound) >= 0;
    const insideB = sign * (b.axial - bound) >= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (bound - a.axial) / (b.axial - a.axial);
      result.push({ across: a.across + t * (b.across - a.across), axial: bound });
    }
  }
  return result;
}

/** Distance to the trimmed flat inside the thread band, not its infinite support plane. */
export function threadFlatClearance(
  face: Face,
  origin: Vector,
  axis: Vector,
  low: number,
  high: number,
): number {
  if (!face.plane) return Infinity;
  const normal = cross(face.plane.u, face.plane.v);
  if (Math.abs(dot(normal, axis)) > 1e-7) return Infinity;
  const across = cross(axis, normal);
  const distance = dot(normal, subtract(face.plane.origin, origin));
  let minimum = Infinity;
  for (let i = 0; i < face.vertices.length; i += 9) {
    const points: Point[] = [];
    for (let j = 0; j < 9; j += 3) {
      const offset = subtract(face.vertices.slice(i + j, i + j + 3) as Vector, origin);
      points.push({ across: dot(offset, across), axial: dot(offset, axis) });
    }
    const clipped = clip(clip(points, low, 1), high, -1);
    if (!clipped.length) continue;
    const values = clipped.map((point) => point.across);
    const min = Math.min(...values),
      max = Math.max(...values);
    const nearest = min > 0 ? min : max < 0 ? -max : 0;
    minimum = Math.min(minimum, Math.hypot(distance, nearest));
  }
  return minimum;
}
