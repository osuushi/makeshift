import { overlapGeometry, type PreviewGeometry } from "../model/overlap-geometry.js";
import { curveDistance, displayPoints } from "../sketch/curve-geometry.js";
import { pickModels } from "../sketch/model-selection.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { type Point, worldPoint } from "../sketch/planes.js";
import { distance } from "../sketch/point-math.js";
import { pointHits } from "../sketch/point-query.js";
import { profilesFor } from "../sketch/profiles.js";
import { pointTarget } from "../sketch/selection-target.js";
import type { ToolSelection, ToolTarget } from "./tool-selection.js";

export interface SelectionCandidate extends PreviewGeometry {
  target: ToolTarget;
}
export function selectionCandidates(selection: ToolSelection): SelectionCandidate[] {
  const e = selection.editor;
  const result: SelectionCandidate[] = [];
  const add = (target: ToolTarget, geometry: () => PreviewGeometry) => {
    if (selection.accepts(target)) result.push({ target, ...geometry() });
  };
  if (selection.planar) {
    const sketch = e.sketch;
    if (!sketch) return [];
    for (const curve of sketch.curves) {
      if (sketch.groups.some((group) => group.members.includes(curve.id))) continue;
      add({ kind: "curve", curve: curve.id }, () => ({
        surfaces: [],
        lines: [
          displayPoints(curve, e.world.height / e.world.canvas.clientHeight).map((p) =>
            worldPoint(sketch.plane, p),
          ),
        ],
      }));
    }
    for (const group of sketch.groups)
      add({ kind: "group", group: group.id }, () => ({
        surfaces: [],
        lines: sketch.curves
          .filter((c) => group.members.includes(c.id))
          .map((c) =>
            displayPoints(c, e.world.height / e.world.canvas.clientHeight).map((p) =>
              worldPoint(sketch.plane, p),
            ),
          ),
      }));
    for (const hit of pointHits(sketch)) {
      const target = pointTarget(hit);
      if (target)
        add(target, () => ({ surfaces: [], lines: [[worldPoint(sketch.plane, hit.point)]] }));
    }
  } else {
    const model = (target: ModelingTarget) => add(target, () => overlapGeometry(e, target));
    for (const body of e.bodiesVisible ? (e.store.data.bodies ?? []) : []) {
      if (!e.visibility.visible(body.id)) continue;
      model({ kind: "body", body: body.id });
      if (selection.policy.pickBodies) continue;
      for (const face of body.faces) model({ kind: "face", body: body.id, face: face.id });
      for (const edge of body.edges) model({ kind: "edge", body: body.id, edge: edge.id });
    }
    for (const sketch of e.store.data.sketches) {
      if (!e.visibility.visible(sketch.id)) continue;
      model({ kind: "sketch", sketch: sketch.id });
      for (const profile of profilesFor(sketch))
        model({ kind: "profile", sketch: sketch.id, profile });
    }
  }
  return result;
}

export function pickSelectionCandidate(
  selection: ToolSelection,
  candidates: SelectionCandidate[],
  screen: Point,
): ToolTarget | null {
  const e = selection.editor;
  if (!selection.planar) {
    const hits = pickModels(e, screen);
    // Body tools retain direct whole-body intent when clicking a body's surface.
    for (const hit of hits) {
      const target =
        "body" in hit && selection.policy.pickBodies
          ? { kind: "body" as const, body: hit.body }
          : hit;
      if (candidates.some((c) => selection.key(c.target) === selection.key(target))) {
        e.modeling.alternatives = hits;
        return target;
      }
    }
    return null;
  }
  const sketch = e.sketch;
  if (!sketch) return null;
  const local = e.world.pointAt(sketch.plane, screen.x, screen.y);
  if (!local) return null;
  const pixels = e.world.canvas.clientHeight / e.world.height;
  const ranked = candidates
    .map((candidate) => {
      const target = candidate.target;
      if (target.kind === "curve" || target.kind === "group") {
        const curves = sketch.curves.filter((c) =>
          target.kind === "curve"
            ? c.id === target.curve
            : sketch.groups.find((g) => g.id === target.group)?.members.includes(c.id),
        );
        return {
          target,
          distance: Math.min(...curves.map((c) => curveDistance(c, local))) * pixels + 1,
        };
      }
      return { target, distance: distance(e.world.project(candidate.lines[0][0]), screen) };
    })
    .filter((hit) => hit.distance <= 9)
    .sort((a, b) => a.distance - b.distance);
  // Colocated points remain independently selectable by repeated clicks.
  return (
    ranked.find(
      (hit) =>
        hit.distance <= (ranked[0]?.distance ?? 0) + 0.1 &&
        hit.target.kind !== "curve" &&
        hit.target.kind !== "group" &&
        !selection.targets.some((t) => selection.key(t) === selection.key(hit.target)),
    )?.target ??
    ranked[0]?.target ??
    null
  );
}
