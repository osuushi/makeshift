import { Box3, Matrix4, Vector3 } from "three";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
import { worldCurveBounds } from "../sketch/world-curve-bounds.js";
import { type Affine, affinePoint, affineVector, identityAffine } from "./affine.js";
import { type LinkedBench, resolvePlacements, type SmartObject } from "./smart-object.js";

/** Exact sketch extrema and the solid bounds in the placement's axes. */
export function benchGeometryBounds(source: LinkedBench, transform: Affine = identityAffine): Box3 {
  const bounds = new Box3();
  const point = new Vector3();
  for (const sketch of source.sketches) {
    const frame: PlaneFrame = {
      origin: affinePoint(transform, sketch.plane.origin),
      u: affineVector(transform, sketch.plane.u),
      v: affineVector(transform, sketch.plane.v),
    };
    for (const curve of sketch.curves)
      for (const p of worldCurveBounds(curve, frame)) bounds.expandByPoint(point.fromArray(p));
  }
  const matrix = new Matrix4().set(...transform, 0, 0, 0, 1);
  const axisAligned = [0, 4, 8].every(
    (row) => transform.slice(row, row + 3).filter((value) => value !== 0).length === 1,
  );
  for (const body of source.bodies ?? []) {
    if (axisAligned) {
      bounds.expandByPoint(point.fromArray(body.bounds, 0).applyMatrix4(matrix));
      bounds.expandByPoint(point.fromArray(body.bounds, 3).applyMatrix4(matrix));
      continue;
    }
    // For oblique placements sample the actual surface, not the empty corners of its source box.
    for (const { vertices } of body.faces)
      for (let i = 0; i < vertices.length; i += 3)
        bounds.expandByPoint(point.fromArray(vertices, i).applyMatrix4(matrix));
  }
  return bounds;
}

export function smartObjectBounds(
  object: SmartObject,
  lookup: (id: string) => LinkedBench | undefined,
): Box3 {
  const bounds = new Box3();
  for (const { source, transform } of resolvePlacements([object], lookup)) {
    const bench = lookup(source);
    if (bench) bounds.union(benchGeometryBounds(bench, transform));
  }
  if (bounds.isEmpty())
    bounds.expandByPoint(new Vector3(...affinePoint(object.transform, [0, 0, 0])));
  return bounds;
}

export function boundsPoints(bounds: Box3): [Vector, Vector] {
  return [bounds.min.toArray(), bounds.max.toArray()];
}
