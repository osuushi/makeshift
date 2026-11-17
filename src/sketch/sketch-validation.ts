import { validId } from "../security/text.js";
import { validateNumeric } from "./constraint-geometry.js";
import { measuredAngle, wrapDegrees } from "./corner-angle.js";
import { curveDistance } from "./curve-geometry.js";
import type { Curve, PointReference, Sketch } from "./document.js";
import { validateFrame } from "./planes.js";
import { endpointKey, linkedPointCoordinate } from "./point-reference.js";
import { validateTangency } from "./tangency.js";

function validateIdentities(items: readonly { id: string }[], kind: string): void {
  const seen = new Set<string>();
  for (const { id } of items) {
    if (!validId(id) || seen.has(id)) throw new Error(`Invalid or duplicate ${kind} identity`);
    seen.add(id);
  }
}

const constraintKinds = new Set([
  "length",
  "radius",
  "corner-angle",
  "point-on-edge",
  "tangent",
  "horizontal",
  "vertical",
  "coincident",
  "parallel",
  "perpendicular",
  "equal",
]);

// Current curve and constraint invariants, in millimetres.
export function validateSketch(sketch: Sketch, solved = true): void {
  validateFrame(sketch.plane);
  validateIdentities(sketch.curves, "curve");
  validateIdentities(sketch.constraints, "constraint");
  validateIdentities(sketch.groups, "group");
  const definitions = new Set<string>();
  for (const constraint of sketch.constraints) {
    if (!constraintKinds.has(constraint.kind)) throw new Error("Unknown sketch constraint kind");
    if ("curve" in constraint !== (constraint.kind === "length" || constraint.kind === "radius"))
      throw new Error("Invalid sketch constraint reference");
    if (
      constraint.kind === "corner-angle" &&
      (!["a", "b"].includes(constraint.aEnd) || !["a", "b"].includes(constraint.bEnd))
    )
      throw new Error("Invalid angle endpoint");
    const { id: _id, ...definition } = constraint;
    const key = JSON.stringify(Object.entries(definition).sort(([a], [b]) => a.localeCompare(b)));
    if (definitions.has(key)) throw new Error("Duplicate sketch constraint");
    definitions.add(key);
  }
  const curves = new Map(sketch.curves.map((curve) => [curve.id, curve]));
  for (const curve of sketch.curves) validateCurve(curve);
  validateNumeric(sketch, !solved);
  validatePointLinks(sketch);
  for (const constraint of sketch.constraints) {
    if (constraint.kind === "point-on-edge") {
      validateIncidence(sketch, constraint.point, constraint.edge, solved);
      continue;
    }
    if ("curve" in constraint) continue;
    if (constraint.kind === "tangent") {
      validateTangency(sketch, constraint, solved);
      continue;
    }
    if (constraint.kind === "corner-angle") {
      if (
        !Number.isFinite(constraint.value) ||
        Math.abs(constraint.value) > 180 ||
        (solved &&
          Math.abs(wrapDegrees(measuredAngle(sketch, constraint) - constraint.value)) > 1e-6)
      )
        throw new Error("Edges must satisfy their angle lock");
      continue;
    }
    if (constraint.kind === "horizontal" || constraint.kind === "vertical") {
      const edge = curves.get(constraint.a);
      if (edge?.kind !== "segment") throw new Error("Constraint requires a line segment");
      const axis = constraint.kind === "horizontal" ? "y" : "x";
      if (solved && Math.abs(edge.b[axis] - edge.a[axis]) > 1e-7)
        throw new Error("Line does not satisfy its axis constraint");
      continue;
    }
    if (constraint.kind === "coincident") {
      const a = linkedPointCoordinate(sketch, constraint.a);
      const b = linkedPointCoordinate(sketch, constraint.b);
      if (!a || !b || (solved && Math.hypot(a.x - b.x, a.y - b.y) > 1e-7))
        throw new Error("Connected endpoints must stay together");
    } else {
      const a = curves.get(constraint.a),
        b = curves.get("b" in constraint ? constraint.b : "");
      if (a?.kind !== "segment" || b?.kind !== "segment")
        throw new Error("Constraint requires line segments");
      const ax = a.b.x - a.a.x,
        ay = a.b.y - a.a.y,
        bx = b.b.x - b.a.x,
        by = b.b.y - b.a.y;
      if (constraint.kind === "equal") {
        if (solved && Math.abs(Math.hypot(ax, ay) - Math.hypot(bx, by)) > 1e-7)
          throw new Error("Line lengths must stay equal");
        continue;
      }
      const residual = constraint.kind === "parallel" ? ax * by - ay * bx : ax * bx + ay * by;
      if (solved && Math.abs(residual) / (Math.hypot(ax, ay) * Math.hypot(bx, by)) > 1e-7)
        throw new Error("Rectangle edges must remain perpendicular and parallel");
    }
  }
  for (const group of sketch.groups) {
    if (
      group.kind !== "rectangle" ||
      group.members.length !== 4 ||
      new Set(group.members).size !== 4 ||
      group.members.some((id) => curves.get(id)?.kind !== "segment")
    )
      throw new Error("Invalid rectangle group");
  }
}

function validateCurve(curve: Curve): void {
  if (!["segment", "circle", "arc", "bezier"].includes(curve.kind))
    throw new Error("Unknown sketch curve kind");
  if (curve.kind === "circle") {
    if (
      ![curve.center.x, curve.center.y, curve.radius].every(Number.isFinite) ||
      curve.radius < 1e-8
    )
      throw new Error("A circle needs a finite center and positive radius");
    return;
  }
  if (![curve.a.x, curve.a.y, curve.b.x, curve.b.y].every(Number.isFinite))
    throw new Error("Coordinates must be finite");
  if (
    curve.kind === "bezier" &&
    ![curve.c1.x, curve.c1.y, curve.c2.x, curve.c2.y].every(Number.isFinite)
  )
    throw new Error("Cubic handles must be finite");
  if (
    Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y) < 1e-8 &&
    (curve.kind !== "bezier" ||
      Math.max(
        Math.hypot(curve.c1.x - curve.a.x, curve.c1.y - curve.a.y),
        Math.hypot(curve.c2.x - curve.a.x, curve.c2.y - curve.a.y),
      ) < 1e-8)
  )
    throw new Error("An edge needs a non-zero length");
  if (curve.kind === "arc" && (!Number.isFinite(curve.bulge) || Math.abs(curve.bulge) < 1e-12))
    throw new Error("An arc needs finite nonzero curvature");
}

function validatePointLinks(sketch: Sketch): void {
  const parent = new Map<string, string>();
  const root = (key: string): string => {
    while (parent.has(key)) key = parent.get(key) ?? key;
    return key;
  };
  for (const c of sketch.constraints) {
    if (c.kind !== "coincident") continue;
    const a = root(endpointKey(c.a)),
      b = root(endpointKey(c.b));
    if (a === b) throw new Error("Redundant point coincidence");
    parent.set(a, b);
  }
}

function validateIncidence(
  sketch: Sketch,
  point: PointReference,
  edge: string,
  solved: boolean,
): void {
  const curve = sketch.curves.find((c) => c.id === edge);
  const position = linkedPointCoordinate(sketch, point);
  if (curve?.kind === "bezier")
    throw new Error("Cubic point-on-edge constraints are not available yet");
  if (!curve || point.curve === edge) throw new Error("Invalid point/edge coincidence");
  if (solved && curveDistance(curve, position) > 1e-7)
    throw new Error("Coincident point must lie on the visible edge");
}
