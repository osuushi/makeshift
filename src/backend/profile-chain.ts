import { flatProfileCap, type RevolvedProfile } from "../model/revolved-profile.js";
import { regionTolerance } from "../sketch/curve-spans.js";
import {
  type Arc,
  type Bezier,
  type Constraint,
  type Curve,
  type Endpoint,
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

/** Normalize the recovered cap and bore endpoint order where there is one meridian. */
function orderedMeridian(
  curves: readonly Curve[],
  { height, endGuides }: Limits,
): Link[] | undefined {
  const remaining = curves.filter(
    (curve): curve is Link => !curve.construction && curve.kind !== "circle",
  );
  if (!remaining.length || remaining.length !== curves.length) return undefined;
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
    if (matches.length !== 1) return undefined;
    const match = matches[0];
    const [curve] = remaining.splice(match.index, 1);
    ordered.push(match.reverse ? reverse(curve) : curve);
  }
  const end = ordered[ordered.length - 1].b;
  if (endGuides ? Math.abs(end.y - height) > regionTolerance : !onAxis(end)) return undefined;
  const anchor = (p: Link["a"], y: number) => (endGuides ? { ...p, y } : { ...p, x: 0 });
  return ordered.map((curve, index) => ({
    ...curve,
    a: index ? ordered[index - 1].b : anchor(curve.a, 0),
    b: index === ordered.length - 1 ? anchor(curve.b, height) : curve.b,
  }));
}

function endpoints(curves: readonly Curve[]) {
  return curves.flatMap((curve) =>
    curve.construction || curve.kind === "circle"
      ? []
      : (["a", "b"] as const).map((end) => ({
          point: curve[end],
          ref: { curve: curve.id, end } satisfies Endpoint,
        })),
  );
}

function coincidentEnds(curves: readonly Curve[]): Constraint[] {
  const ends = endpoints(curves);
  return ends.flatMap(({ point, ref }, i) => {
    const neighbors = ends
      .map((other, j) => ({ ...other, j }))
      .filter((other) => i !== other.j && distance(point, other.point) <= regionTolerance);
    const [other] = neighbors;
    return neighbors.length === 1 && other.j > i && other.ref.curve !== ref.curve
      ? [{ id: newId(), kind: "coincident", a: ref, b: other.ref }]
      : [];
  });
}

/** Preserve an endpoint snapped to the axis while solving its sketch relationships. */
export function profileAxisAnchors(sketch: Sketch) {
  const ends = endpoints(sketch.curves);
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
  const curves = orderedMeridian(recovered, profile) ?? recovered;
  const constraints = coincidentEnds(curves);
  for (const cap of curves.filter(flatProfileCap))
    constraints.push({ id: newId(), kind: "horizontal", a: cap.id });
  const sketch = { ...emptySketch(profile.frame), curves, constraints };
  return { sketch, origins };
}
