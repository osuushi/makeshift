import { curveDistance, displayPoints } from "../sketch/curve-geometry.js";
import { boundaryPoints } from "../sketch/curve-spans.js";
import { newId } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pickModels } from "../sketch/model-selection.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Point } from "../sketch/planes.js";
import { coplanar, type PlaneFrame, worldPoint } from "../sketch/planes.js";
import { segmentDistance } from "../sketch/point-math.js";
import { profilesFor } from "../sketch/profiles.js";
import { BodyPickProbe } from "./body-picking.js";
import { pickBodyEdge } from "./edge-selection.js";
import { coverageTargets } from "./operation-selection.js";
import { type ProjectionSource, projectionCurves } from "./projection.js";
import { selectionContext } from "./selection-context.js";
export const projectionKey = (s: ProjectionSource) => JSON.stringify(s);
export function projectionSource(target: ModelingTarget): ProjectionSource {
  if (target.kind === "profile")
    return { kind: "profile", sketch: target.sketch, profile: target.profile.key };
  if (target.kind === "edge") return { kind: "edge", body: target.body, edge: target.edge };
  return target;
}
export function projectionTargets(
  e: SketchEditor,
  sources: readonly ProjectionSource[],
): ModelingTarget[] {
  return sources.flatMap((source): ModelingTarget[] => {
    if (source.kind === "curve") return [];
    if (source.kind !== "profile") return [source];
    const sketch = e.store.data.sketches.find((s) => s.id === source.sketch);
    const profile = sketch && profilesFor(sketch).find((p) => p.key === source.profile);
    return profile ? [{ kind: "profile", sketch: source.sketch, profile }] : [];
  });
}
export function projectionSelection(e: SketchEditor): ProjectionSource[] {
  if (e.world.active && e.sketch)
    return [...e.selectedCurves].map((curve) => ({
      kind: "curve",
      sketch: e.sketch?.id ?? "",
      curve,
    }));
  const sources = coverageTargets(selectionContext(e.modeling.targets, e.store.data)).map(
    projectionSource,
  );
  return sources.filter(
    (s, i) => sources.findIndex((p) => projectionKey(p) === projectionKey(s)) === i,
  );
}
export function pickProjectionSource(e: SketchEditor, screen: Point): ProjectionSource | null {
  const probe = new BodyPickProbe(e, screen);
  const edge = pickBodyEdge(e, screen, probe);
  if (edge) return { kind: "edge", body: edge.body, edge: edge.edge };
  let best: { source: ProjectionSource; distance: number } | undefined;
  for (const sketch of e.store.data.sketches) {
    if (!e.visibility.visible(sketch.id)) continue;
    const local = e.world.pointAt(sketch.plane, screen.x, screen.y);
    for (const curve of sketch.curves) {
      if (local && curveDistance(curve, local) > e.world.height * 0.1) continue;
      const points = displayPoints(curve, e.world.height / e.world.canvas.clientHeight).map((p) =>
        e.world.projectLocal(sketch.plane, p),
      );
      const d = Math.min(...points.slice(1).map((p, i) => segmentDistance(screen, points[i], p)));
      if (d < 7 && (!best || d < best.distance))
        best = { source: { kind: "curve", sketch: sketch.id, curve: curve.id }, distance: d };
    }
  }
  if (best) return best.source;
  const target = pickModels(e, screen).find((target) => {
    if (target.kind !== "profile" && target.kind !== "sketch") return true;
    const sketch = e.store.data.sketches.find((s) => s.id === target.sketch);
    return (
      sketch &&
      (target.kind === "sketch" || profilesFor(sketch).some((p) => p.key === target.profile.key))
    );
  });
  return target ? projectionSource(target) : null;
}
export function projectionLines(e: SketchEditor, sources: readonly ProjectionSource[]): number[][] {
  return projectionCurves(e.store.data, sources).flatMap((s) => {
    if (s.kind === "edge") {
      const edge = e.store.data.bodies
        ?.find((b) => b.id === s.body)
        ?.edges.find((c) => c.id === s.edge);
      return edge ? [[...edge.points]] : [];
    }
    const sketch = e.store.data.sketches.find((sketch) => sketch.id === s.sketch);
    if (s.kind === "profile") {
      const profile = sketch && profilesFor(sketch).find((p) => p.key === s.profile);
      return sketch && profile
        ? [profile.outer, ...profile.holes].map((loop) =>
            boundaryPoints(loop, e.world.height / e.world.canvas.clientHeight).flatMap((p) =>
              worldPoint(sketch.plane, p),
            ),
          )
        : [];
    }
    const curve = sketch?.curves.find((c) => c.id === s.curve);
    return sketch && curve
      ? [
          displayPoints(curve, e.world.height / e.world.canvas.clientHeight).flatMap((p) =>
            worldPoint(sketch.plane, p),
          ),
        ]
      : [];
  });
}

export function projectionDestination(
  editor: SketchEditor,
  frame: PlaneFrame,
  sketchId?: string,
): { frame: PlaneFrame; sketchId: string } {
  const e = editor;
  const visible = e.store.data.sketches.find(
    (sketch) => e.visibility.visible(sketch.id) && coplanar(sketch.plane, frame),
  );
  // An explicit new ID prevents the backend from reusing a hidden coplanar sketch.
  return { frame, sketchId: sketchId ?? visible?.id ?? newId() };
}
