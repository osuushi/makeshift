import { arcCircle } from "./arc-geometry.js";
import { constraintCurves } from "./constraint-geometry.js";
import {
  type Constraint,
  type Curve,
  newId,
  type PointReference,
  type Sketch,
} from "./document.js";
import { fusePoints, unfusePoints } from "./point-links.js";
import { distance } from "./point-math.js";
import { linkedPointCoordinate } from "./point-reference.js";
import { validateSketch } from "./sketch-validation.js";
import { spanCurve, type TrimSpan, trimRemainders } from "./trim-geometry.js";
import { fuseTrimCorners, newTrimEndpoints } from "./trim-links.js";
import { overlappingTrim } from "./trim-overlap.js";

function mappedPoint(
  original: Sketch,
  p: PointReference,
  source: Curve,
  pieces: Curve[],
): PointReference[] {
  if (p.curve !== source.id) return [p];
  const old = linkedPointCoordinate(original, p);
  return pieces.flatMap((c): PointReference[] => {
    if (p.end === "center") {
      const center = c.kind === "circle" ? c.center : c.kind === "arc" ? arcCircle(c).center : null;
      return center && distance(old, center) < 1e-7 ? [{ curve: c.id, end: "center" }] : [];
    }
    if (c.kind === "circle") return [];
    return (["a", "b"] as const)
      .filter((end) => distance(old, c[end]) < 1e-7)
      .map((end) => ({ curve: c.id, end }));
  });
}
function remapConstraint(
  c: Constraint,
  source: Curve,
  pieces: Curve[],
  original: Sketch,
): Constraint[] {
  if (!constraintCurves(c).includes(source.id)) return [c];
  if (c.kind === "coincident") return [];
  if (c.kind === "point-on-edge") {
    const points = mappedPoint(original, c.point, source, pieces);
    const edges = c.edge === source.id ? pieces.map((p) => p.id) : [c.edge];
    return points.flatMap((point) => edges.map((edge) => ({ ...c, point, edge })));
  }
  const targets = c.kind === "tangent" || c.kind === "radius" ? pieces : pieces.slice(0, 1);
  return targets.map((piece, i) => {
    const id = i === 0 ? c.id : newId();
    if ("curve" in c) return { ...c, id, curve: piece.id };
    return {
      ...c,
      id,
      a: c.a === source.id ? piece.id : c.a,
      ...("b" in c ? { b: c.b === source.id ? piece.id : c.b } : {}),
    };
  });
}
function rewriteTrim(original: Sketch, span: TrimSpan) {
  const source = span.curve,
    pieces = trimRemainders(span);
  // Trimming a rectangle casts its convenience group to its ordinary constraints.
  const groups = original.groups.filter((g) => !g.members.includes(source.id));
  const group = original.groups.find((g) => g.members.includes(source.id));
  const opposite =
    group &&
    original.curves.find((c) => c.id === group.members[(group.members.indexOf(source.id) + 2) % 4]);
  const refs: PointReference[] =
    source.kind === "circle"
      ? [{ curve: source.id, end: "center" }]
      : [
          { curve: source.id, end: "a" },
          { curve: source.id, end: "b" },
          ...(source.kind === "arc" ? [{ curve: source.id, end: "center" as const }] : []),
        ];
  const gone = refs.filter((p) => !mappedPoint(original, p, source, pieces).length);
  const detached = unfusePoints({ ...original, groups }, gone);
  let changed: Sketch = {
    ...detached,
    curves: original.curves.flatMap((c) => (c.id === source.id ? pieces : [c])),
    constraints: [],
  };
  const retained = new Set<string>();
  changed = preserveRelations(
    changed,
    detached.constraints,
    source,
    pieces,
    opposite,
    retained,
    original,
  );
  for (const c of detached.constraints) {
    if (c.kind !== "coincident") continue;
    const a = mappedPoint(original, c.a, source, pieces),
      b = mappedPoint(original, c.b, source, pieces);
    if (!a.length || !b.length) continue;
    let first = true;
    for (const p of a)
      for (const q of b) {
        const before = changed.constraints.length;
        changed = fusePoints(changed, [p, q]);
        if (first && changed.constraints.length > before) {
          changed = {
            ...changed,
            constraints: changed.constraints.map((v, i) => (i === before ? { ...v, id: c.id } : v)),
          };
          first = false;
        }
      }
    retained.add(c.id);
  }
  return {
    sketch: changed,
    removed: original.constraints.filter((c) => !retained.has(c.id)),
    pieces,
    cast: groups.length !== original.groups.length,
  };
}

function preserveRelations(
  changed: Sketch,
  originalConstraints: readonly Constraint[],
  source: Curve,
  pieces: Curve[],
  opposite: Curve | undefined,
  retained: Set<string>,
  original: Sketch,
): Sketch {
  for (const c of originalConstraints) {
    if (c.kind === "coincident") continue;
    const directions = [
      "horizontal",
      "vertical",
      "parallel",
      "perpendicular",
      "corner-angle",
    ].includes(c.kind);
    const replacements =
      !pieces.length && opposite && ["parallel", "perpendicular"].includes(c.kind)
        ? [opposite]
        : pieces;
    let kept = 0;
    for (const candidate of remapConstraint(c, source, replacements, original)) {
      if ("a" in candidate && "b" in candidate && candidate.a === candidate.b) continue;
      try {
        validateSketch({ ...changed, constraints: [candidate], groups: [] });
      } catch {
        continue;
      }
      changed = {
        ...changed,
        constraints: [...changed.constraints, { ...candidate, id: kept++ ? candidate.id : c.id }],
      };
      retained.add(c.id);
    }
    if (
      directions &&
      pieces.length === 2 &&
      constraintCurves(c).includes(source.id) &&
      kept &&
      !changed.constraints.some(
        (v) => v.kind === "parallel" && v.a === pieces[0].id && v.b === pieces[1].id,
      )
    )
      changed = {
        ...changed,
        constraints: [
          ...changed.constraints,
          { id: newId(), kind: "parallel", a: pieces[0].id, b: pieces[1].id },
        ],
      };
  }
  return changed;
}

/** Clear the highlighted locus in this sketch in one accepted rewrite. */
export function trimOverlappingSketch(
  original: Sketch,
  target: TrimSpan | readonly TrimSpan[],
  skipConstruction = false,
) {
  const spans = Array.isArray(target) ? target : [target as TrimSpan];
  let sketch = original;
  let cast = false;
  const created: ReturnType<typeof newTrimEndpoints> = [];
  for (const span of spans) {
    const highlight = spanCurve(span);
    const pending = sketch.curves.filter((curve) => !skipConstruction || !curve.construction);
    while (pending.length) {
      const curve = pending.pop();
      if (!curve) break;
      // Later brush targets refer to the original geometry. Resolve their locus
      // against current remnants, rather than applying stale parameters/IDs.
      const overlap = curve === span.curve ? span : overlappingTrim(curve, highlight);
      if (!overlap) continue;
      const next = rewriteTrim(sketch, overlap);
      created.push(...newTrimEndpoints(curve, next.pieces));
      pending.push(...next.pieces);
      sketch = next.sketch;
      cast ||= next.cast;
    }
  }
  sketch = fuseTrimCorners(sketch, created);
  const retained = new Set(sketch.constraints.map((c) => c.id));
  return { sketch, cast, removed: original.constraints.filter((c) => !retained.has(c.id)) };
}

export function trimSketch(original: Sketch, span: TrimSpan) {
  const result = rewriteTrim(original, span);
  return {
    ...result,
    sketch: fuseTrimCorners(result.sketch, newTrimEndpoints(span.curve, result.pieces)),
  };
}
