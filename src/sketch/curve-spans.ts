import { arcCircle, arcDomain, positiveAngle } from "./arc-geometry.js";
import {
  bezierArea,
  bezierAt,
  bezierCurvature,
  bezierDerivative,
  bezierParameter,
  bezierSamples,
  bezierSelfCrossing,
  bezierSpan,
} from "./bezier-geometry.js";
import { circlePoint, closestOnCurve, displayPoints } from "./curve-geometry.js";
import { curveIntersections } from "./curve-intersections.js";
import type { Curve } from "./document.js";
import type { Point } from "./planes.js";
import { add, distance, dot, scale, subtract } from "./point-math.js";

export const regionTolerance = 1e-7;
const turn = 2 * Math.PI;
// Parameters are segment fractions or circle angles. Reversing a span reverses
// its domain. Arc entities supply bounded angular domains to the same walker.
export interface CurveSpan {
  curve: Curve;
  start: number;
  end: number;
}
export function curvePoint(curve: Curve, parameter: number): Point {
  if (curve.kind === "bezier") return bezierAt(curve, parameter);
  return curve.kind !== "segment"
    ? circlePoint(curve.kind === "arc" ? arcCircle(curve) : curve, parameter)
    : add(curve.a, scale(subtract(curve.b, curve.a), parameter));
}
function parameterAt(curve: Curve, point: Point): number {
  if (curve.kind === "bezier") return bezierParameter(curve, point);
  if (curve.kind === "segment") {
    const v = subtract(curve.b, curve.a);
    return Math.max(0, Math.min(1, dot(subtract(point, curve.a), v) / dot(v, v)));
  }
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  const angle = Math.atan2(point.y - circle.center.y, point.x - circle.center.x);
  if (curve.kind === "arc") {
    const { start, sweep } = arcDomain(curve),
      low = Math.min(start, start + sweep);
    if (distance(point, curvePoint(curve, low)) < regionTolerance) return low;
    return low + positiveAngle(angle - low);
  }
  return (angle + turn) % turn;
}
function curveLength(curve: Curve): number {
  if (curve.kind === "bezier")
    return distance(curve.a, curve.c1) + distance(curve.c1, curve.c2) + distance(curve.c2, curve.b);
  return curve.kind === "arc"
    ? arcCircle(curve).radius
    : curve.kind === "circle"
      ? curve.radius
      : distance(curve.a, curve.b);
}

/** Analytic connections first: endpoints, crossings, tangencies and collinear overlap. */
export function splitCurveSpans(input: readonly Curve[]): CurveSpan[] {
  const curves = input.filter((c) => !c.construction && curveLength(c) > regionTolerance);
  const cuts = curves.map((c) => {
    if (c.kind === "arc") {
      const { start, sweep } = arcDomain(c);
      return [start, start + sweep];
    }
    return c.kind === "circle"
      ? [0, Math.PI, turn]
      : c.kind === "bezier"
        ? [0, 0.5, 1, ...bezierSelfCrossing(c)]
        : [0, 1];
  });
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const a = curves[i],
        b = curves[j];
      const candidates = [
        ...curveIntersections(a, b),
        ...(a.kind !== "circle" ? [a.a, a.b] : []),
        ...(b.kind !== "circle" ? [b.a, b.b] : []),
      ];
      for (const point of candidates) {
        if (
          distance(point, closestOnCurve(a, point)) > regionTolerance ||
          distance(point, closestOnCurve(b, point)) > regionTolerance
        )
          continue;
        cuts[i].push(parameterAt(a, point));
        cuts[j].push(parameterAt(b, point));
      }
    }
  }
  return curves.flatMap((curve, index) => {
    const epsilon = regionTolerance / curveLength(curve);
    const sorted = cuts[index].sort((a, b) => a - b);
    const unique = sorted.filter((value, i) => i === 0 || value - sorted[i - 1] > epsilon);
    return unique.slice(1).map((end, i) => ({ curve, start: unique[i], end }));
  });
}

export function spanTangent(span: CurveSpan): Point {
  const sign = Math.sign(span.end - span.start);
  if (span.curve.kind === "bezier") {
    const tangent = scale(bezierDerivative(span.curve, span.start), sign);
    if (Math.hypot(tangent.x, tangent.y) > 1e-12) return tangent;
    // A collapsed handle uses the first nonzero control vector as its limiting tangent.
    const part = bezierSpan(span.curve, span.start, span.end);
    return (
      [part.c1, part.c2, part.b]
        .map((p) => subtract(p, part.a))
        .find((v) => Math.hypot(v.x, v.y) > 1e-12) ?? tangent
    );
  }
  if (span.curve.kind !== "segment")
    return { x: -Math.sin(span.start) * sign, y: Math.cos(span.start) * sign };
  return scale(subtract(span.curve.b, span.curve.a), sign);
}
export function spanCurvature(span: CurveSpan): number {
  if (span.curve.kind === "bezier")
    return Math.sign(span.end - span.start) * bezierCurvature(span.curve, span.start);
  return span.curve.kind !== "segment"
    ? Math.sign(span.end - span.start) / curveLength(span.curve)
    : 0;
}
export function spanArea(span: CurveSpan): number {
  const { curve, start, end } = span;
  if (curve.kind === "bezier") return bezierArea(curve, start, end);
  const a = curvePoint(curve, start),
    b = curvePoint(curve, end);
  if (curve.kind === "segment") return (a.x * b.y - a.y * b.x) / 2;
  const circle = curve.kind === "arc" ? arcCircle(curve) : curve;
  return (
    (circle.center.x * (b.y - a.y) -
      circle.center.y * (b.x - a.x) +
      circle.radius ** 2 * (end - start)) /
    2
  );
}

/** Display sampling is downstream of topology; it cannot add/remove connections. */
export function boundaryPoints(boundary: readonly CurveSpan[], unitsPerPixel: number): Point[] {
  return boundary.flatMap((span) => {
    if (span.curve.kind === "bezier")
      return bezierSamples(
        bezierSpan(span.curve, span.start, span.end),
        Math.max(1e-8, unitsPerPixel * 0.3),
      ).slice(0, -1);
    if (span.curve.kind === "segment") return [curvePoint(span.curve, span.start)];
    const fullCount =
      displayPoints(span.curve.kind === "arc" ? arcCircle(span.curve) : span.curve, unitsPerPixel)
        .length - 1;
    const count = Math.max(1, Math.ceil((fullCount * Math.abs(span.end - span.start)) / turn));
    return Array.from({ length: count }, (_, i) =>
      curvePoint(span.curve, span.start + ((span.end - span.start) * i) / count),
    );
  });
}
