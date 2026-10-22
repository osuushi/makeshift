import { bezierAt } from "../sketch/bezier-geometry.js";
import type { Bezier } from "../sketch/document.js";
import type { Point } from "../sketch/planes.js";
import { trimSpanLength } from "../sketch/trim-geometry.js";

const midpoints = new WeakMap<Bezier, Point>();
/** Half arc length, independent of the control points' parameter speed. */
export function bezierMidpoint(curve: Bezier): Point {
  const cached = midpoints.get(curve);
  if (cached) return cached;
  const half = trimSpanLength({ curve, start: 0, end: 1 }) / 2;
  let low = 0,
    high = 1,
    t = 0.5;
  for (let i = 0; i < 48; i++) {
    t = (low + high) / 2;
    const length = trimSpanLength({ curve, start: 0, end: t });
    if (Math.abs(length - half) < 1e-7) break;
    if (length < half) low = t;
    else high = t;
  }
  const point = bezierAt(curve, t);
  midpoints.set(curve, point);
  return point;
}
