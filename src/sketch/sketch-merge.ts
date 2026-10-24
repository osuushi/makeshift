import {
  type Constraint,
  type Curve,
  newId,
  type PointReference,
  type Sketch,
  type SketchDocument,
} from "./document.js";
import { coplanar, type PlaneFrame, type Point } from "./planes.js";
import { validateSketch } from "./sketch-validation.js";

export function mergeSketches(
  target: Sketch,
  sources: readonly Sketch[],
  correspondence = new Map<string, Map<string, string>>(),
): Sketch {
  if (sources.some((source) => source.id === target.id))
    throw new Error("A sketch cannot be merged with itself");
  if (sources.some((source) => !coplanar(target.plane, source.plane)))
    throw new Error("Sketches must share a plane");
  const curveIds = new Set(target.curves.map((curve) => curve.id));
  const constraintIds = new Set(target.constraints.map((constraint) => constraint.id));
  const groupIds = new Set(target.groups.map((group) => group.id));
  const curves = [...target.curves],
    constraints = [...target.constraints],
    groups = [...target.groups];
  for (const source of sources) {
    const transform = planeTransform(source.plane, target.plane);
    const curveMap = new Map<string, string>();
    correspondence.set(source.id, curveMap);
    const sourceCurves = source.curves.map((curve) => {
      const id = uniqueId(curve.id, curveIds);
      curveMap.set(curve.id, id);
      return { ...transformCurve(curve, transform), id };
    });
    curves.push(...sourceCurves);
    constraints.push(
      ...source.constraints.map((constraint) =>
        remapConstraint(constraint, curveMap, constraintIds),
      ),
    );
    groups.push(
      ...source.groups.map((group) => ({
        ...group,
        id: uniqueId(group.id, groupIds),
        members: group.members.map((member) => curveMap.get(member) ?? member),
      })),
    );
  }
  const merged = { ...target, curves, constraints, groups };
  validateSketch(merged);
  return merged;
}

export function mergeDocumentSketches(
  document: SketchDocument,
  targetId: string,
  sourceIds: readonly string[],
): SketchDocument {
  const target = document.sketches.find((sketch) => sketch.id === targetId);
  const ids = new Set(sourceIds);
  const sources = document.sketches.filter((sketch) => ids.has(sketch.id));
  if (!target || sources.length !== ids.size || !ids.size)
    throw new Error("Sketch no longer exists");
  const correspondence = new Map<string, Map<string, string>>();
  const merged = mergeSketches(target, sources, correspondence);
  return {
    ...document,
    ...(document.guidePoints
      ? {
          guidePoints: document.guidePoints.map((guide) => {
            const anchor = guide.anchor;
            if (anchor.kind !== "sketch-curve") return guide;
            const curve = correspondence.get(anchor.sketch)?.get(anchor.curve);
            return curve ? { ...guide, anchor: { ...anchor, sketch: targetId, curve } } : guide;
          }),
        }
      : {}),
    sketches: document.sketches
      .filter((sketch) => !ids.has(sketch.id))
      .map((sketch) => (sketch.id === target.id ? merged : sketch)),
  };
}

type PlaneTransform = {
  origin: Point;
  x: Point;
  y: Point;
  reflected: boolean;
};

function planeTransform(from: PlaneFrame, to: PlaneFrame): PlaneTransform {
  const dot = (a: readonly number[], b: readonly number[]) =>
    a.reduce((sum, value, i) => sum + value * b[i], 0);
  const offset = from.origin.map((value, i) => value - to.origin[i]);
  const origin = { x: dot(offset, to.u), y: dot(offset, to.v) };
  const x = { x: dot(from.u, to.u), y: dot(from.u, to.v) };
  const y = { x: dot(from.v, to.u), y: dot(from.v, to.v) };
  return { origin, x, y, reflected: x.x * y.y - x.y * y.x < 0 };
}

function transformPoint(point: Point, transform: PlaneTransform): Point {
  return {
    x: transform.origin.x + transform.x.x * point.x + transform.y.x * point.y,
    y: transform.origin.y + transform.x.y * point.x + transform.y.y * point.y,
  };
}

function transformCurve(curve: Curve, transform: PlaneTransform): Curve {
  if (curve.kind === "circle") return { ...curve, center: transformPoint(curve.center, transform) };
  const points = { a: transformPoint(curve.a, transform), b: transformPoint(curve.b, transform) };
  if (curve.kind === "arc")
    return { ...curve, ...points, bulge: transform.reflected ? -curve.bulge : curve.bulge };
  if (curve.kind === "bezier")
    return {
      ...curve,
      ...points,
      c1: transformPoint(curve.c1, transform),
      c2: transformPoint(curve.c2, transform),
    };
  return { ...curve, ...points };
}

function uniqueId(preferred: string, used: Set<string>): string {
  if (!used.has(preferred)) {
    used.add(preferred);
    return preferred;
  }
  let id = newId();
  while (used.has(id)) id = newId();
  used.add(id);
  return id;
}

function remapCurve(id: string, curveMap: ReadonlyMap<string, string>): string {
  return curveMap.get(id) ?? id;
}

function remapPoint(reference: PointReference, curveMap: ReadonlyMap<string, string>) {
  return { ...reference, curve: remapCurve(reference.curve, curveMap) };
}

function remapConstraint(
  constraint: Constraint,
  curveMap: ReadonlyMap<string, string>,
  used: Set<string>,
): Constraint {
  const id = uniqueId(constraint.id, used);
  switch (constraint.kind) {
    case "point-on-edge":
      return {
        ...constraint,
        id,
        point: remapPoint(constraint.point, curveMap),
        edge: remapCurve(constraint.edge, curveMap),
      };
    case "coincident":
      return {
        ...constraint,
        id,
        a: remapPoint(constraint.a, curveMap),
        b: remapPoint(constraint.b, curveMap),
      };
    case "length":
    case "radius":
      return { ...constraint, id, curve: remapCurve(constraint.curve, curveMap) };
    case "horizontal":
    case "vertical":
      return { ...constraint, id, a: remapCurve(constraint.a, curveMap) };
    case "parallel":
    case "perpendicular":
    case "equal":
      return {
        ...constraint,
        id,
        a: remapCurve(constraint.a, curveMap),
        b: remapCurve(constraint.b, curveMap),
      };
    case "corner-angle":
      return {
        ...constraint,
        id,
        a: remapCurve(constraint.a, curveMap),
        b: remapCurve(constraint.b, curveMap),
      };
    case "tangent":
      return {
        ...constraint,
        id,
        a: remapCurve(constraint.a, curveMap),
        b: remapCurve(constraint.b, curveMap),
      };
  }
}
