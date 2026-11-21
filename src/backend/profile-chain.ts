import type { RevolvedProfile } from "../model/revolved-profile.js";
import { arcDomain } from "../sketch/arc-geometry.js";
import { type CurveSpan, regionTolerance } from "../sketch/curve-spans.js";
import {
  type Arc,
  type Bezier,
  type Curve,
  emptySketch,
  newId,
  type Segment,
} from "../sketch/document.js";
import { distance } from "../sketch/point-math.js";

type Link = Segment | Arc | Bezier;
const disconnected = "Join the profile into one continuous chain between the end guides";

function reverse(curve: Link): Link {
  const ends = { a: curve.b, b: curve.a };
  if (curve.kind === "arc") return { ...curve, ...ends, bulge: -curve.bulge };
  if (curve.kind === "bezier") return { ...curve, ...ends, c1: curve.c2, c2: curve.c1 };
  return { ...curve, ...ends };
}

function chain(curves: readonly Curve[], height: number): Link[] {
  const remaining = curves.filter(
    (curve): curve is Link => !curve.construction && curve.kind !== "circle",
  );
  if (!remaining.length || curves.some((curve) => !curve.construction && curve.kind === "circle"))
    throw new Error(disconnected);
  const ordered: Link[] = [];
  while (remaining.length) {
    const tail = ordered.at(-1)?.b;
    const connects = (point: Link["a"]) =>
      tail ? distance(tail, point) <= regionTolerance : Math.abs(point.y) <= regionTolerance;
    const matches = remaining.flatMap((curve, index) =>
      [
        connects(curve.a) && { index, reverse: false },
        connects(curve.b) && { index, reverse: true },
      ].filter((match) => match !== false),
    );
    if (matches.length !== 1) throw new Error(disconnected);
    const match = matches[0];
    const [curve] = remaining.splice(match.index, 1);
    ordered.push(match.reverse ? reverse(curve) : curve);
  }
  if (Math.abs(ordered[ordered.length - 1].b.y - height) > regionTolerance)
    throw new Error(disconnected);
  return ordered;
}

export function profileSpans(curves: readonly Curve[], height: number): CurveSpan[] {
  return chain(curves, height).map((curve) => {
    if (curve.kind !== "arc") return { curve, start: 0, end: 1 };
    const { start, sweep } = arcDomain(curve);
    return { curve, start, end: start + sweep };
  });
}

export function profileSketch(profile: RevolvedProfile) {
  const origins = new Map<string, string>();
  const recovered = profile.spans.flatMap(({ face, curves }) =>
    curves.map((curve) => {
      const id = newId();
      origins.set(id, face);
      return { ...curve, id };
    }),
  );
  const ordered = chain(recovered, profile.height);
  const curves = ordered.map((curve, index) => ({
    ...curve,
    a: index ? ordered[index - 1].b : { ...curve.a, y: 0 },
    b: index === ordered.length - 1 ? { ...curve.b, y: profile.height } : curve.b,
  }));
  const sketch = {
    ...emptySketch(profile.frame),
    curves,
    constraints: curves.slice(1).map((curve, index) => ({
      id: newId(),
      kind: "coincident" as const,
      a: { curve: curves[index].id, end: "b" as const },
      b: { curve: curve.id, end: "a" as const },
    })),
  };
  return { sketch, origins };
}
