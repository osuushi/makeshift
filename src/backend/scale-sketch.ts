import type { ScaleOperation } from "../model/scale.js";
import { circularBeziers } from "../sketch/circular-beziers.js";
import type { Curve, Sketch } from "../sketch/document.js";
import { validateSketch } from "../sketch/sketch-validation.js";
import { scaleCurveConnections } from "./scale-curve-connections.js";
import { scaledSketchFrame } from "./scale-frame.js";

type Operation = Extract<ScaleOperation, { kind: "curves" | "sketches" }>;

/** Exact affine coordinates, with bounded cubic replacement only where necessary. */
export function scaleSketch(
  sketch: Sketch,
  operation: Operation,
  replacements = new Map<string, Curve[]>(),
): Sketch {
  const selected = new Set(
    operation.kind === "sketches" ? sketch.curves.map((c) => c.id) : operation.ids,
  );
  if (
    !selected.size ||
    (operation.kind === "curves" &&
      (selected.size !== operation.ids.length ||
        operation.ids.some((id) => !sketch.curves.some((c) => c.id === id))))
  )
    throw new Error("Select existing whole curves to transform");
  const frame = scaledSketchFrame(sketch.plane, operation),
    map = frame.map;
  const similarity =
    Math.abs(frame.x - frame.y) <= 1e-12 * Math.max(frame.x, frame.y) &&
    Math.abs(frame.shear) <= 1e-12 * Math.max(frame.x, frame.y);
  const used = new Set([...sketch.curves, ...sketch.constraints].map((item) => item.id));
  const allocate = (base: string): string => {
    let id = base;
    while (used.has(id)) id += "_";
    used.add(id);
    return id;
  };
  const curves = sketch.curves.flatMap((curve): Curve[] => {
    if (!selected.has(curve.id)) return [curve];
    if (!similarity && (curve.kind === "circle" || curve.kind === "arc")) {
      const pieces = circularBeziers(
        curve,
        map,
        Math.hypot(frame.x, frame.y, frame.shear),
        (index) => (index === 0 ? curve.id : allocate(`${curve.id}:transform:${index}`)),
      );
      replacements.set(curve.id, pieces);
      return pieces;
    }
    if (curve.kind === "circle")
      return [{ ...curve, center: map(curve.center), radius: curve.radius * frame.x }];
    if (curve.kind === "bezier")
      return [{ ...curve, a: map(curve.a), b: map(curve.b), c1: map(curve.c1), c2: map(curve.c2) }];
    return [{ ...curve, a: map(curve.a), b: map(curve.b) }];
  });
  const constraints = scaleCurveConnections(sketch, replacements, allocate);
  const result: Sketch = { ...sketch, curves, constraints, plane: frame.plane };
  try {
    validateSketch(result);
  } catch (error) {
    throw new Error(
      `Transform conflicts with sketch constraints: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return result;
}
