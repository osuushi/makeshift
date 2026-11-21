import { bowRadius } from "../sketch/arc-geometry.js";
import { moveBezierEnds } from "../sketch/bezier-geometry.js";
import { numericConstraints, validateNumeric } from "../sketch/constraint-geometry.js";
import { resolveCubicTangencies } from "../sketch/cubic-tangency.js";
import type { PointReference, Sketch } from "../sketch/document.js";
import type { EditIntent } from "../sketch/edit-intent.js";
import { validateSketch } from "../sketch/sketch-validation.js";
import type { NativeSolver } from "./native-solver.js";
import { solvedArc, solverLayout } from "./solver-geometry.js";
import { solverInput } from "./solver-input.js";
import { checkResiduals } from "./solver-residuals.js";

export async function solveSketch(
  target: Sketch,
  previous: Sketch | undefined,
  solver: NativeSolver,
  exact: boolean,
  intent: EditIntent,
  axisAnchors?: readonly PointReference[],
) {
  let count = 0,
    ms = 0;
  // Reject malformed/degenerate targets early; persistent constraints are checked
  // against the solved output. C2 pointer targets can project onto line relationships.
  validateSketch({ ...target, constraints: [] });
  validateNumeric(target, !exact || intent.kind === "pair");
  let solved = target;
  if (target.curves.length && target.constraints.length) {
    const input = solverInput(target, previous, intent, axisAnchors);
    const started = performance.now();
    const result = input.constraints.length ? await solver.solve(input) : input;
    const { points, radii } = result;
    count = 1;
    ms = performance.now() - started;
    checkResiduals(input, points, radii);
    const exactPoints = new Set(input.exact ?? []);
    for (const i of exactPoints)
      if (Math.hypot(points[i].x - input.points[i].x, points[i].y - input.points[i].y) > 1e-6)
        throw new Error("That edit conflicts with a line relationship");
    const radiusLocks = numericConstraints(target).filter((c) => c.kind === "radius");
    const layout = solverLayout(target);
    solved = {
      ...target,
      curves: target.curves.map((curve) => {
        const radiusIndex = radiusLocks.findIndex((c) => c.curve === curve.id);
        if (curve.kind === "circle")
          return {
            ...curve,
            center: points[layout.index(curve.id)],
            radius:
              input.curveRadii?.[curve.id] !== undefined
                ? radii[input.curveRadii[curve.id]]
                : radiusIndex < 0
                  ? curve.radius
                  : radii[radiusIndex],
          };
        if (curve.kind === "arc") {
          if (input.curveRadii?.[curve.id] !== undefined) {
            const i = layout.index(curve.id);
            return solvedArc(curve, points[i], points[i + 1], points[i + 2]);
          }
          return radiusIndex < 0 ? curve : bowRadius(curve, radii[radiusIndex], 1);
        }
        const i = layout.index(curve.id);
        return curve.kind === "bezier"
          ? moveBezierEnds(curve, points[i], points[i + 1])
          : { ...curve, a: points[i], b: points[i + 1] };
      }),
    };
  }
  solved = resolveCubicTangencies(solved, previous, intent);
  validateSketch(solved);
  return { sketch: solved, count, ms };
}
