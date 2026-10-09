import { emptySketch, newId } from "../sketch/document.js";
import { segment } from "../sketch/geometry.js";
import { type PlaneFrame, type Point, type Vector, worldPoint } from "../sketch/planes.js";

/** Project the viewing direction onto the section plane; head-on uses local V. */
export function sphereAxisDirection(plane: PlaneFrame, view: Vector): Point {
  const dot = (axis: Vector) => axis.reduce((sum, value, i) => sum + value * view[i], 0);
  const x = dot(plane.u),
    y = dot(plane.v),
    length = Math.hypot(x, y);
  return length > 1e-7 ? { x: x / length, y: y / length } : { x: 0, y: 1 };
}

/** Ordinary circle and diameter create two regions; only one is revolved. */
export function sphereSketch(
  placement: { plane: PlaneFrame; center: Point; radius: number },
  view: Vector,
) {
  const { plane, center, radius } = placement;
  const direction = sphereAxisDirection(plane, view);
  const endpoint = (sign: number) => ({
    x: center.x + sign * radius * direction.x,
    y: center.y + sign * radius * direction.y,
  });
  const diameter = segment(endpoint(-1), endpoint(1));
  const sketch = {
    ...emptySketch(plane),
    curves: [
      { id: newId(), kind: "circle" as const, center, radius, construction: false },
      diameter,
    ],
  };
  const probe = {
    x: center.x - (radius * direction.y) / 2,
    y: center.y + (radius * direction.x) / 2,
  };
  const axis = {
    origin: worldPoint(plane, center),
    direction: plane.u.map((value, i) => value * direction.x + plane.v[i] * direction.y) as Vector,
  };
  return { sketch, axis, probe };
}
