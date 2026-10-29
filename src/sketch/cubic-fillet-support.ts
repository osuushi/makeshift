import { arcCircle } from "./arc-geometry.js";
import { bezierAt, bezierDerivative, bezierPowers } from "./bezier-geometry.js";
import type { Arc, Bezier, Segment } from "./document.js";
import { add, distance, scale } from "./point-math.js";
import { multiply, roots, sum } from "./polynomial.js";

function extendedSpan(curve: Bezier, start: number, end: number): Bezier {
  const a = bezierAt(curve, start),
    b = bezierAt(curve, end);
  return {
    ...curve,
    a,
    b,
    c1: add(a, scale(bezierDerivative(curve, start), (end - start) / 3)),
    c2: add(b, scale(bezierDerivative(curve, end), (start - end) / 3)),
  };
}

// Recover a removed corner from the current polynomial and analytic support.
// No saved source curve or feature history is needed for later radius edits.
export function recoverCubicCorner(curve: Bezier, end: "a" | "b", peer: Segment | Arc) {
  for (const extent of [1, 2, 4, 8, 16]) {
    const start = end === "a" ? -extent : 1;
    const finish = end === "a" ? 0 : 1 + extent;
    const span = extendedSpan(curve, start, finish);
    const x = bezierPowers(span, "x"),
      y = bezierPowers(span, "y");
    let equation: number[];
    if (peer.kind === "segment") {
      x[0] -= peer.a.x;
      y[0] -= peer.a.y;
      equation = sum(
        x.map((v) => v * (peer.b.y - peer.a.y)),
        y.map((v) => -v * (peer.b.x - peer.a.x)),
      );
    } else {
      const circle = arcCircle(peer);
      x[0] -= circle.center.x;
      y[0] -= circle.center.y;
      equation = sum(multiply(x, x), multiply(y, y));
      equation[0] -= circle.radius ** 2;
    }
    const candidates = roots(equation)
      .map((t) => start + t * (finish - start))
      .filter((t) => (end === "a" ? t < -1e-8 : t > 1 + 1e-8))
      .sort(
        (a, b) =>
          distance(bezierAt(curve, a), curve[end]) - distance(bezierAt(curve, b), curve[end]),
      );
    if (candidates.length) {
      const t = candidates[0];
      return extendedSpan(curve, end === "a" ? t : 0, end === "b" ? t : 1);
    }
  }
  throw new Error("The cubic and analytic supports do not recover a nearby corner");
}
