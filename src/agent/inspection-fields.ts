import type { DecoratorInstance } from "../decorators/types.js";
import { safeName } from "../security/text.js";
import { arcCircle } from "../sketch/arc-geometry.js";
import type { Constraint, Curve, EditingGroup } from "../sketch/document.js";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import type { TaggedGroup } from "../tags/model.js";

export const frameSummary = ({ origin, u, v }: PlaneFrame) => ({ origin, u, v });
export const groupSummary = ({ id, kind, members }: EditingGroup) => ({ id, kind, members });
export const tagSummary = ({ id, name, body, members, problems, splitFrom }: TaggedGroup) => ({
  id,
  name,
  body,
  members: members.map(({ id, kind }) => ({ id, kind })),
  problems,
  ...(splitFrom ? { splitFrom } : {}),
});
export const decoratorSummary = ({ id, definition, version, faces }: DecoratorInstance) => ({
  id,
  definition: safeName(definition, "Unknown"),
  version,
  faces: faces.map(({ body, face }) => ({ body, face })),
});
const point = ({ x, y }: Point) => ({ x, y });
export function curveSummary(c: Curve) {
  const basic = { id: c.id, construction: c.construction === true, kind: c.kind };
  if (c.kind === "circle")
    return {
      ...basic,
      center: point(c.center),
      radius: c.radius,
      diameter: 2 * c.radius,
      length: 2 * Math.PI * c.radius,
    };
  const ends = { ...basic, a: point(c.a), b: point(c.b) };
  if (c.kind === "segment") return { ...ends, length: Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) };
  if (c.kind === "bezier") return { ...ends, c1: point(c.c1), c2: point(c.c2) };
  const circle = arcCircle(c),
    sweep = 4 * Math.atan(c.bulge);
  return {
    ...ends,
    bulge: c.bulge,
    ...(c.semicircleBranch === "major" ? { semicircleBranch: c.semicircleBranch } : {}),
    center: point(circle.center),
    radius: circle.radius,
    sweepRadians: sweep,
    length: Math.abs(sweep) * circle.radius,
  };
}
export function constraintSummary(c: Constraint) {
  const base = { id: c.id, kind: c.kind };
  if (c.kind === "coincident")
    return {
      ...base,
      a: { curve: c.a.curve, end: c.a.end },
      b: { curve: c.b.curve, end: c.b.end },
    };
  if (c.kind === "point-on-edge")
    return { ...base, point: { curve: c.point.curve, end: c.point.end }, edge: c.edge };
  if (c.kind === "length" || c.kind === "radius")
    return { ...base, curve: c.curve, value: c.value };
  if (c.kind === "corner-angle")
    return { ...base, a: c.a, b: c.b, aEnd: c.aEnd, bEnd: c.bEnd, value: c.value };
  if (c.kind === "tangent")
    return {
      ...base,
      a: c.a,
      b: c.b,
      side: c.side,
      ...(c.junction ? { junction: { aEnd: c.junction.aEnd, bEnd: c.junction.bEnd } } : {}),
    };
  if (c.kind === "equal" || c.kind === "parallel" || c.kind === "perpendicular")
    return { ...base, a: c.a, b: c.b };
  if (c.kind === "horizontal" || c.kind === "vertical") return { ...base, a: c.a };
  return base;
}
