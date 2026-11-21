import { flatProfileCap, type RevolvedProfile } from "../model/revolved-profile.js";
import { arcDomain } from "../sketch/arc-geometry.js";
import { type CurveSpan, regionTolerance } from "../sketch/curve-spans.js";
import {
  type Arc,
  type Bezier,
  type Constraint,
  type Curve,
  emptySketch,
  newId,
  type Segment,
  type Sketch,
} from "../sketch/document.js";
import { distance } from "../sketch/point-math.js";

type Link = Segment | Arc | Bezier;
type Limits = Pick<RevolvedProfile, "height" | "endGuides">;

function reverse(curve: Link): Link {
  const ends = { a: curve.b, b: curve.a };
  if (curve.kind === "arc") return { ...curve, ...ends, bulge: -curve.bulge };
  if (curve.kind === "bezier") return { ...curve, ...ends, c1: curve.c2, c2: curve.c1 };
  return { ...curve, ...ends };
}

function chain(curves: readonly Curve[], { height, endGuides }: Limits): Link[] {
  const disconnected = endGuides
    ? "Join the profile into one continuous chain between the end guides"
    : "Join the profile into one continuous chain with both ends on the axis";
  const remaining = curves.filter(
    (curve): curve is Link => !curve.construction && curve.kind !== "circle",
  );
  if (!remaining.length || curves.some((curve) => !curve.construction && curve.kind === "circle"))
    throw new Error(disconnected);
  const onAxis = ({ x }: Link["a"]) => Math.abs(x) <= regionTolerance;
  const firstStation = endGuides
    ? 0
    : Math.min(
        ...remaining
          .flatMap(({ a, b }) => [a, b])
          .filter(onAxis)
          .map(({ y }) => y),
      );
  const atStart = (point: Link["a"]) =>
    (endGuides || onAxis(point)) && Math.abs(point.y - firstStation) <= regionTolerance;
  const ordered: Link[] = [];
  while (remaining.length) {
    const tail = ordered.at(-1)?.b;
    const connects = (point: Link["a"]) =>
      tail ? distance(tail, point) <= regionTolerance : atStart(point);
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
  const end = ordered[ordered.length - 1].b;
  if (endGuides ? Math.abs(end.y - height) > regionTolerance : !onAxis(end))
    throw new Error(disconnected);
  const anchor = (p: Link["a"], y: number) => (endGuides ? { ...p, y } : { ...p, x: 0 });
  return ordered.map((curve, index) => ({
    ...curve,
    a: index ? ordered[index - 1].b : anchor(curve.a, 0),
    b: index === ordered.length - 1 ? anchor(curve.b, height) : curve.b,
  }));
}

export function profileSpans(curves: readonly Curve[], limits: Limits): CurveSpan[] {
  return chain(curves, limits).map((curve) => {
    if (curve.kind !== "arc") return { curve, start: 0, end: 1 };
    const { start, sweep } = arcDomain(curve);
    return { curve, start, end: start + sweep };
  });
}

/** Preserve an endpoint snapped to the axis while solving its sketch relationships. */
export function profileAxisAnchors(sketch: Sketch) {
  const ends = sketch.curves.flatMap((curve) =>
    curve.construction || curve.kind === "circle"
      ? []
      : (["a", "b"] as const).map((end) => ({ point: curve[end], ref: { curve: curve.id, end } })),
  );
  return ends
    .filter(
      ({ point }, i) =>
        Math.abs(point.x) <= regionTolerance &&
        !ends.some((other, j) => j !== i && distance(other.point, point) <= regionTolerance),
    )
    .map(({ ref }) => ref);
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
  const curves = chain(recovered, profile);
  const constraints: Constraint[] = curves.slice(1).map((curve, index) => ({
    id: newId(),
    kind: "coincident",
    a: { curve: curves[index].id, end: "b" },
    b: { curve: curve.id, end: "a" },
  }));
  for (const cap of curves.filter(flatProfileCap))
    constraints.push({ id: newId(), kind: "horizontal", a: cap.id });
  const sketch = { ...emptySketch(profile.frame), curves, constraints };
  return { sketch, origins };
}
