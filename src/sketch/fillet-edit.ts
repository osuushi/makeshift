import { arcCircle } from "./arc-geometry.js";
import { constraintCurves } from "./constraint-geometry.js";
import { type Arc, type Constraint, newId, type Sketch } from "./document.js";
import { consumedFilletConstraints } from "./fillet-consumption.js";
import { type FilletCorner, filletCorner, filletGeometry } from "./fillet-geometry.js";
import { coincidentPoints } from "./line-edit.js";
import { unfusePoints } from "./point-links.js";
import { distance } from "./point-math.js";
import { roundingTangentSide } from "./rounding-tangency.js";

export function createFillet(sketch: Sketch, corner: FilletCorner, radius: number, id = newId()) {
  const geometry = filletGeometry(sketch.curves, corner, radius, id);
  const detached = unfusePoints(sketch, [
    { curve: corner.a.id, end: corner.aEnd },
    { curve: corner.b.id, end: corner.bEnd },
  ]);
  const changed = {
    ...detached,
    curves: geometry.curves,
    groups: detached.groups.filter(
      (g) => !g.members.includes(corner.a.id) && !g.members.includes(corner.b.id),
    ),
  };
  const retained = consumedFilletConstraints(changed, corner, geometry.arc);
  const removed = sketch.constraints.filter((c) => !retained.some((p) => p.id === c.id));
  const constraints: Constraint[] = [...retained];
  for (const [line, end, arcEnd] of [
    [corner.a, corner.aEnd, "a"],
    [corner.b, corner.bEnd, "b"],
  ] as const) {
    if (!geometry.curves.some((c) => c.id === line.id)) continue;
    const side = roundingTangentSide(line, geometry.arc);
    constraints.push(
      {
        id: newId(),
        kind: "coincident",
        a: { curve: line.id, end },
        b: { curve: id, end: arcEnd },
      },
      {
        id: newId(),
        kind: "tangent",
        a: line.id,
        b: id,
        side,
        junction: { aEnd: end, bEnd: arcEnd },
      },
    );
  }
  return { sketch: { ...changed, constraints }, removed, arc: geometry.arc };
}

// A fillet is recognized from ordinary tangent and coincidence relationships.
// Removing those relationships restores ordinary fixed-endpoint arc editing.
export function existingFillet(sketch: Sketch, arc: Arc): FilletCorner | null {
  const ends = (["a", "b"] as const).map((end) => {
    const linked = coincidentPoints(sketch, { curve: arc.id, end });
    const matches = linked.flatMap((p) => {
      const line = sketch.curves.find((c) => c.id === p.curve);
      if (
        !line ||
        line.kind === "circle" ||
        line.kind === "bezier" ||
        line.id === arc.id ||
        p.end === "center"
      )
        return [];
      return sketch.constraints.some(
        (c) =>
          c.kind === "tangent" &&
          ((c.a === arc.id && c.b === line.id) || (c.b === arc.id && c.a === line.id)),
      )
        ? [{ line, end: p.end }]
        : [];
    });
    return matches.length === 1 ? matches[0] : undefined;
  });
  const [a, b] = ends;
  if (!a || !b || a.line.id === b.line.id) return null;
  try {
    const corner = filletCorner(a.line, b.line, a.end, b.end);
    const shape = filletGeometry(sketch.curves, corner, arcCircle(arc).radius, arc.id).arc;
    return distance(shape.a, arc.a) < 1e-7 &&
      distance(shape.b, arc.b) < 1e-7 &&
      Math.abs(shape.bulge - arc.bulge) < 1e-7
      ? corner
      : null;
  } catch {
    return null;
  }
}
export function editFilletRadius(sketch: Sketch, arc: Arc, radius: number): Sketch | null {
  const corner = existingFillet(sketch, arc);
  if (!corner) return null;
  if (radius === 0) {
    const constraints = sketch.constraints.filter((c) => !constraintCurves(c).includes(arc.id));
    constraints.push({
      id: newId(),
      kind: "coincident",
      a: { curve: corner.a.id, end: corner.aEnd },
      b: { curve: corner.b.id, end: corner.bEnd },
    });
    return {
      ...sketch,
      curves: sketch.curves
        .filter((c) => c.id !== arc.id)
        .map((c) => (c.id === corner.a.id ? corner.a : c.id === corner.b.id ? corner.b : c)),
      groups: sketch.groups.filter((g) => !g.members.includes(arc.id)),
      constraints,
    };
  }
  const geometry = filletGeometry(sketch.curves, corner, radius, arc.id);
  const changed = { ...sketch, curves: geometry.curves };
  return {
    ...changed,
    constraints: consumedFilletConstraints(changed, corner, geometry.arc, false),
  };
}
