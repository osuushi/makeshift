import { arcCircle } from "./arc-geometry.js";
import type { PointReference, Sketch } from "./document.js";
import { distance } from "./point-math.js";

// Transient instructions for one calculation, never stored in the document.
export type EditIntent =
  | {
      readonly kind: "direct";
      readonly curveOrigins?: readonly import("../guides/sketch-continuation.js").CurveContinuation[];
    }
  | {
      readonly kind: "point" | "transform" | "dimension";
      readonly targets: readonly PointReference[];
    }
  | {
      readonly kind: "pair";
      readonly targets: readonly PointReference[];
      readonly subject: string;
      readonly reference?: string;
    };
export type EditAction =
  | { kind: "direct" }
  | { kind: "dimension" }
  | { kind: "pair"; subject: string; reference?: string; points?: readonly PointReference[] };

// The caller has already chosen the operation. Deltas describe its requested
// coordinate changes; they never classify a drag as rigid or a rewrite as a pair.
export function changedTargets(before: Sketch | undefined, after: Sketch): PointReference[] {
  const targets: PointReference[] = [];
  for (const curve of after.curves) {
    const old = before?.curves.find((c) => c.id === curve.id);
    if (!old || old.kind !== curve.kind) continue;
    if (curve.kind === "circle" && old.kind === "circle") {
      if (distance(curve.center, old.center) > 1e-8)
        targets.push({ curve: curve.id, end: "center" });
    } else if (curve.kind !== "circle" && old.kind !== "circle") {
      for (const end of ["a", "b"] as const)
        if (distance(curve[end], old[end]) > 1e-8) targets.push({ curve: curve.id, end });
      if (
        curve.kind === "arc" &&
        old.kind === "arc" &&
        distance(arcCircle(curve).center, arcCircle(old).center) > 1e-8
      )
        targets.push({ curve: curve.id, end: "center" });
    }
  }
  return targets;
}
export function actionIntent(
  action: EditAction,
  before: Sketch | undefined,
  after: Sketch,
): EditIntent {
  if (action.kind === "direct") return action;
  const targets =
    action.kind === "pair" && action.points ? action.points : changedTargets(before, after);
  return action.kind === "pair"
    ? { kind: "pair", subject: action.subject, reference: action.reference, targets }
    : { kind: "dimension", targets };
}
