import { arcCircle, bowRadius } from "../sketch/arc-geometry.js";
import {
  constraintCurves,
  geometricRelations,
  numericConstraints,
  numericValue,
} from "../sketch/constraint-geometry.js";
import type {
  Constraint,
  EditingGroup,
  NumericConstraint,
  PointReference,
  Sketch,
} from "../sketch/document.js";
import type { EditIntent } from "../sketch/edit-intent.js";
import type { Point } from "../sketch/planes.js";
import { add, scale } from "../sketch/point-math.js";
import { rectangleFrame } from "../sketch/rectangle-edit.js";
import { relationalTargets } from "./relational-targets.js";
import { solverLayout } from "./solver-geometry.js";
import { seedTangency, tangentEquations } from "./solver-tangency.js";

export interface Equation {
  kind:
    | "tangent-normal"
    | "tangent-circles"
    | "tangent-line"
    | "corner-angle"
    | "on-line"
    | "on-circle"
    | "coincident"
    | "parallel"
    | "perpendicular"
    | "x"
    | "y"
    | "distance"
    | "angle"
    | "radius"
    | "horizontal"
    | "vertical"
    | "equal";
  internal?: boolean;
  parallel?: boolean;
  c?: number;
  d?: number;
  otherRadius?: number;
  side?: number;
  temporary?: boolean;
  radius?: number;
  reverseA?: boolean;
  reverseB?: boolean;
  a: number;
  b?: number;
  value?: number;
}
export interface SolverResult {
  points: Point[];
  radii: number[];
}
export interface SolverInput {
  fixed?: number[];
  fixedRadii?: number[];
  curveRadii?: Record<string, number>;
  exact?: number[];
  radii: number[];
  points: Point[];
  constraints: Equation[];
}
// Target coordinates express the existing handle/anchor UX. Only five temporary
// targets per rectangle drive the solve; the remaining coordinates follow constraints.
export function solverInput(
  target: Sketch,
  previous?: Sketch,
  intent: EditIntent = { kind: "direct" },
  axisAnchors: readonly PointReference[] = [],
): SolverInput {
  const { layout, input: permanent } = permanentInput(target, previous);
  const { points, index } = layout;
  for (const point of axisAnchors)
    permanent.constraints.push({ kind: "x", a: layout.pointIndex(point), value: 0 });
  seedTangency(target, previous, points, index);
  const externallyRelated = new Set(geometricRelations(target).flatMap(constraintCurves));
  const rectangles = target.groups.filter(
    (g) =>
      g.members.every((id) => !externallyRelated.has(id)) && rectangleChanged(target, previous, g),
  );
  const handled = new Set(rectangles.flatMap((g) => g.members));
  const input = relationalTargets(target, previous, permanent, index, intent, handled);
  const grouped = new Set<string>();
  for (const group of rectangles) rectangleTargets(target, previous, group, input, index, grouped);
  return input;
}
// Permanent equations and native coordinate/radius layout do not depend on a gesture.
function permanentInput(target: Sketch, previous: Sketch | undefined) {
  const layout = solverLayout(target);
  const { points, index } = layout;
  const constraints: Equation[] = target.constraints
    .filter(
      (c): c is Exclude<Constraint, NumericConstraint | { kind: "tangent" | "point-on-edge" }> =>
        !("curve" in c) && c.kind !== "tangent" && c.kind !== "point-on-edge",
    )
    .map((constraint) =>
      constraint.kind === "coincident"
        ? {
            kind: constraint.kind,
            a: layout.pointIndex(constraint.a),
            b: layout.pointIndex(constraint.b),
          }
        : {
            kind: constraint.kind,
            a: index(constraint.a),
            b: "b" in constraint ? index(constraint.b) : undefined,
            ...(constraint.kind === "corner-angle"
              ? {
                  value: (constraint.value * Math.PI) / 180,
                  reverseA: constraint.aEnd === "b",
                  reverseB: constraint.bEnd === "b",
                }
              : {}),
          },
    );
  const { radii, curveRadii } = radiusParameters(target, previous, layout, constraints);
  for (const c of target.constraints) {
    if (c.kind !== "point-on-edge") continue;
    const curve = target.curves.find((curve) => curve.id === c.edge);
    constraints.push({
      kind: curve?.kind === "segment" ? "on-line" : "on-circle",
      a: layout.pointIndex(c.point),
      b: index(c.edge) + (curve?.kind === "arc" ? 2 : 0),
      radius: curveRadii[c.edge],
    });
  }
  constraints.push(...tangentEquations(target, layout, curveRadii));
  return { layout, input: { points, constraints, radii, curveRadii } };
}
function radiusParameters(
  target: Sketch,
  previous: Sketch | undefined,
  layout: ReturnType<typeof solverLayout>,
  constraints: Equation[],
) {
  const { points, index } = layout;
  const locks = numericConstraints(target);
  const radiusLocks = locks.filter((c) => c.kind === "radius");
  const radii = radiusLocks.map((c) => {
    const old = previous?.curves.find((curve) => curve.id === c.curve);
    return old && old.kind !== "segment" ? numericValue(old, "radius") : c.value;
  });
  radiusLocks.forEach((c, a) => {
    constraints.push({ kind: "radius", a, value: c.value });
  });
  const curveRadii: Record<string, number> = {};
  for (const curve of layout.curves) {
    if (curve.kind === "segment" || curve.kind === "bezier") continue;
    if (
      curve.kind === "circle" &&
      !target.constraints.some(
        (c) =>
          (c.kind === "tangent" && [c.a, c.b].includes(curve.id)) ||
          (c.kind === "point-on-edge" && c.edge === curve.id),
      )
    )
      continue;
    let radius = radiusLocks.findIndex((c) => c.curve === curve.id);
    if (radius < 0) radius = radii.length;
    const lock = radiusLocks.find((c) => c.curve === curve.id);
    radii[radius] = lock?.value ?? numericValue(curve, "radius");
    curveRadii[curve.id] = radius;
    const a = index(curve.id);
    if (curve.kind === "circle") continue;
    if (lock && Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y) <= 2 * lock.value)
      points[a + 2] = arcCircle(bowRadius(curve, lock.value, 1)).center;
    constraints.push(
      { kind: "on-circle", a, b: a + 2, radius },
      { kind: "on-circle", a: a + 1, b: a + 2, radius },
    );
  }
  return { radii, curveRadii };
}
function rectangleTargets(
  target: Sketch,
  previous: Sketch | undefined,
  group: EditingGroup,
  input: SolverInput,
  index: (id: string) => number,
  grouped: Set<string>,
): void {
  const { points, constraints } = input;
  const locks = numericConstraints(target);
  const frame = rectangleFrame(target, group);
  const old = previous?.groups.find((item) => item.id === group.id);
  const seed = old && previous ? rectangleFrame(previous, old) : { width: 1, height: 1 };
  const origin = frame.corners[0],
    a = index(group.members[0]);
  const widthLocks = locks.filter(
    (c) => c.kind === "length" && [group.members[0], group.members[2]].includes(c.curve),
  );
  const heightLocks = locks.filter(
    (c) => c.kind === "length" && [group.members[1], group.members[3]].includes(c.curve),
  );
  if (widthLocks.length > 1 || heightLocks.length > 1)
    throw new Error("Redundant rectangle dimension locks");
  constraints.push(
    { kind: "x", a, value: origin.x },
    { kind: "y", a, value: origin.y },
    { kind: "angle", a, b: a + 1, value: Math.atan2(frame.u.y, frame.u.x) },
    { kind: "distance", a, b: a + 1, value: widthLocks[0]?.value ?? frame.width },
    {
      kind: "distance",
      a: index(group.members[1]),
      b: index(group.members[1]) + 1,
      value: heightLocks[0]?.value ?? frame.height,
    },
  );
  // Orient the old extents onto the desired branch before solving: this handles
  // flips across the anchor without letting a distance constraint choose a mirror.
  const corners = [
    [0, 0],
    [seed.width, 0],
    [seed.width, seed.height],
    [0, seed.height],
  ].map(([x, y]) => add(origin, add(scale(frame.u, x), scale(frame.v, y))));
  group.members.forEach((id, corner) => {
    if (grouped.has(id)) throw new Error("Overlapping rectangle groups");
    grouped.add(id);
    points[index(id)] = corners[corner];
    points[index(id) + 1] = corners[(corner + 1) % 4];
  });
}

function rectangleChanged(
  target: Sketch,
  previous: Sketch | undefined,
  group: EditingGroup,
): boolean {
  if (!previous?.groups.some((g) => g.id === group.id)) return true;
  const members = new Set(group.members);
  const contents = (sketch: Sketch) => ({
    curves: sketch.curves.filter((c) => members.has(c.id)),
    constraints: sketch.constraints.filter((c) =>
      constraintCurves(c).some((id) => members.has(id)),
    ),
  });
  return JSON.stringify(contents(target)) !== JSON.stringify(contents(previous));
}
