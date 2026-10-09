import { type PlaneFrame, planeNormal } from "../sketch/planes.js";
import type { BodyGeometry } from "./body.js";

/** Project exact shape bounds, rather than sampled mesh points, through the entire body. */
export function drillDepth(body: BodyGeometry, plane: PlaneFrame): number {
  const normal = planeNormal(plane);
  let depth = 0;
  for (let corner = 0; corner < 8; corner++) {
    let projection = 0;
    for (let axis = 0; axis < 3; axis++)
      projection +=
        (plane.origin[axis] - body.bounds[axis + (corner & (1 << axis) ? 3 : 0)]) * normal[axis];
    depth = Math.max(depth, projection);
  }
  // Clear numerical face coincidence without appreciably extending the drill.
  return depth > 1e-7 ? depth + Math.max(1e-5, depth * 1e-8) : 0;
}
