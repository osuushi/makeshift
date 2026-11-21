import { type Affine, affineFrame } from "../model/affine.js";
import { circularBeziers } from "../sketch/circular-beziers.js";
import { type Curve, newId, type PointReference, type Sketch } from "../sketch/document.js";
import { scaleCurveConnections } from "./scale-curve-connections.js";

export function materializeSmartSketch(sketch: Sketch, transform: Affine): Sketch {
  const frame = affineFrame(sketch.plane, transform);
  const { map, x, y, shear } = frame;
  const tolerance = Math.max(x, y) * 1e-12;
  const similar = Math.abs(x - y) <= tolerance && Math.abs(shear) <= tolerance;
  const replacements = new Map<string, Curve[]>();
  const curves = sketch.curves.flatMap((curve): Curve[] => {
    if (!similar && (curve.kind === "circle" || curve.kind === "arc")) {
      const pieces = circularBeziers(curve, map, Math.hypot(x, y, shear), (i) =>
        i ? newId() : curve.id,
      );
      replacements.set(curve.id, pieces);
      return pieces;
    }
    if (curve.kind === "circle")
      return [{ ...curve, center: map(curve.center), radius: curve.radius * x }];
    if (curve.kind === "bezier")
      return [{ ...curve, a: map(curve.a), b: map(curve.b), c1: map(curve.c1), c2: map(curve.c2) }];
    return [{ ...curve, a: map(curve.a), b: map(curve.b) }];
  });
  const retained = (ref: PointReference) => ref.end !== "center" || !replacements.has(ref.curve);
  const connections = sketch.constraints
    .filter((constraint) => {
      if (similar || constraint.kind === "parallel") return true;
      if (constraint.kind === "coincident") return retained(constraint.a) && retained(constraint.b);
      if (constraint.kind === "point-on-edge")
        return retained(constraint.point) && !replacements.has(constraint.edge);
      return false;
    })
    .map((constraint) =>
      "curve" in constraint ? { ...constraint, value: constraint.value * x } : constraint,
    );
  const constraints = scaleCurveConnections(
    { ...sketch, constraints: connections },
    replacements,
    newId,
  );
  return {
    ...sketch,
    plane: frame.plane,
    curves,
    constraints,
    groups: similar ? sketch.groups : [],
  };
}
