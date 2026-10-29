import { arcCircle, positiveAngle } from "./arc-geometry.js";
import { type CubicOffset, cubicOffsetContacts } from "./cubic-rounding.js";
import { closestOnCurve } from "./curve-geometry.js";
import { supportIntersections } from "./curve-intersections.js";
import type { Arc, Circle, Segment } from "./document.js";
import type { FilletCorner } from "./fillet-geometry.js";
import type { Point } from "./planes.js";
import { add, distance, dot, scale, subtract } from "./point-math.js";
import { type CurveEnd, farEnd, inwardTangent, type RoundingCurve } from "./rounding-curves.js";

type Support = { locus: Circle | Segment | CubicOffset; pinned: boolean };
function supports(curve: RoundingCurve, end: CurveEnd, radius: number): Support[] {
  const pinned: Support = {
    locus: { id: "pin", kind: "circle", center: curve[farEnd(end)], radius, construction: false },
    pinned: true,
  };
  if (curve.kind === "bezier")
    return [-1, 1]
      .map<Support>((sign) => ({
        locus: { kind: "cubic-offset", curve, offset: sign * radius },
        pinned: false,
      }))
      .concat([pinned]);
  if (curve.kind === "arc") {
    const circle = arcCircle(curve);
    return [circle.radius + radius, Math.abs(circle.radius - radius)]
      .filter((r) => r > 1e-7)
      .map<Support>((r) => ({ locus: { ...circle, radius: r }, pinned: false }))
      .concat([pinned]);
  }
  const u = inwardTangent(curve, end),
    n = { x: -u.y, y: u.x };
  return [-1, 1]
    .map<Support>((sign) => ({
      locus: {
        ...curve,
        a: add(curve.a, scale(n, sign * radius)),
        b: add(curve.b, scale(n, sign * radius)),
      },
      pinned: false,
    }))
    .concat([pinned]);
}
function contacts(
  curve: RoundingCurve,
  end: CurveEnd,
  center: Point,
  radius: number,
  pinned: boolean,
): Point[] {
  if (pinned) return [curve[farEnd(end)]];
  if (curve.kind === "bezier") return [];
  if (curve.kind === "segment") {
    const u = inwardTangent(curve, "a");
    return [add(curve.a, scale(u, dot(subtract(center, curve.a), u)))];
  }
  const circle = arcCircle(curve),
    d = distance(center, circle.center);
  if (d < 1e-7) return [];
  return [-1, 1]
    .map((s) => add(circle.center, scale(subtract(center, circle.center), (s * circle.radius) / d)))
    .filter((p) => Math.abs(distance(p, center) - radius) < 1e-6);
}
function connectingArc(
  c: FilletCorner,
  center: Point,
  a: Point,
  b: Point,
  pinnedA: boolean,
  pinnedB: boolean,
  id: string,
): Arc | null {
  if (distance(a, b) < 1e-7) return null;
  const start = Math.atan2(a.y - center.y, a.x - center.x),
    end = Math.atan2(b.y - center.y, b.x - center.x);
  for (const sign of [-1, 1]) {
    const sweep = sign * positiveAngle(sign * (end - start));
    if (Math.abs(sweep) > Math.PI + 1e-7 || Math.abs(sweep) < 1e-10) continue;
    const tangent = (p: Point) => {
      const v = subtract(p, center);
      return scale({ x: -v.y, y: v.x }, sign / Math.hypot(v.x, v.y));
    };
    if (!pinnedA && dot(tangent(a), inwardTangent(c.a, c.aEnd, a)) > -1 + 1e-6) continue;
    if (!pinnedB && dot(tangent(b), inwardTangent(c.b, c.bEnd, b)) < 1 - 1e-6) continue;
    const bulge = Math.tan(sweep / 4);
    if (pinnedA && pinnedB && Math.sign(bulge) !== -Math.sign(c.u.x * c.v.y - c.u.y * c.v.x))
      continue;
    return { id, kind: "arc", a, b, bulge, construction: c.a.construction && c.b.construction };
  }
  return null;
}
export function roundingShape(c: FilletCorner, radius: number, id: string): Arc {
  const choices: { arc: Arc; pins: number; score: number }[] = [];
  for (const a of supports(c.a, c.aEnd, radius))
    for (const b of supports(c.b, c.bEnd, radius)) {
      for (const { center, first, second } of centers(a, b)) {
        for (const p of first ? [first] : contacts(c.a, c.aEnd, center, radius, a.pinned))
          for (const q of second ? [second] : contacts(c.b, c.bEnd, center, radius, b.pinned)) {
            if (
              distance(closestOnCurve(c.a, p), p) > 1e-6 ||
              distance(closestOnCurve(c.b, q), q) > 1e-6
            )
              continue;
            const arc = connectingArc(c, center, p, q, a.pinned, b.pinned, id);
            if (arc)
              choices.push({
                arc,
                pins: Number(a.pinned) + Number(b.pinned),
                score: distance(p, c.point) + distance(q, c.point),
              });
          }
      }
    }
  choices.sort((a, b) => a.pins - b.pins || a.score - b.score);
  if (!choices[0]) throw new Error("No rounding arc fits this radius on the selected curves");
  return choices[0].arc;
}

function centers(a: Support, b: Support): { center: Point; first?: Point; second?: Point }[] {
  if (a.locus.kind === "cubic-offset") {
    if (b.locus.kind === "cubic-offset") return [];
    return cubicOffsetContacts(a.locus, b.locus).map(({ center, contact }) => ({
      center,
      first: contact,
    }));
  }
  if (b.locus.kind === "cubic-offset")
    return cubicOffsetContacts(b.locus, a.locus).map(({ center, contact }) => ({
      center,
      second: contact,
    }));
  return supportIntersections(a.locus, b.locus).map((center) => ({ center }));
}
