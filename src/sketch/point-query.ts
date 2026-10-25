import { arcAt, arcCircle } from "./arc-geometry.js";
import { bezierAt } from "./bezier-geometry.js";
import type { Curve, EditingGroup, Sketch } from "./document.js";
import { midpoint } from "./point-math.js";
import { rectangleFrame } from "./rectangle-edit.js";
import { type PointTarget, pointTarget, targetKey } from "./selection-target.js";
import type { Hit, PointHit } from "./sketch-hit.js";

export function pointKey(hit: Hit | null): string | null {
  const target = hit && pointTarget(hit);
  return target ? targetKey(target) : null;
}

export function rectangleHandles(sketch: Sketch, group: EditingGroup) {
  const frame = rectangleFrame(sketch, group);
  return [
    ...frame.corners.map((point, index) => ({ point, handle: { kind: "corner" as const, index } })),
    ...frame.corners.map((point, index) => ({
      point: midpoint(point, frame.corners[(index + 1) % 4]),
      handle: { kind: "edge" as const, index },
    })),
  ];
}

function curvePoints(curve: Curve): PointHit[] {
  if (curve.kind === "circle")
    return [{ kind: "circleCenter", curve: curve.id, point: curve.center }];
  if (curve.kind === "arc")
    return [
      { kind: "endpoint", endpoint: { curve: curve.id, end: "a" }, point: curve.a },
      { kind: "endpoint", endpoint: { curve: curve.id, end: "b" }, point: curve.b },
      { kind: "circleCenter", curve: curve.id, point: arcCircle(curve).center },
      { kind: "midpoint", curve: curve.id, point: arcAt(curve, 0.5) },
    ];
  return [
    { kind: "endpoint", endpoint: { curve: curve.id, end: "a" }, point: curve.a },
    { kind: "endpoint", endpoint: { curve: curve.id, end: "b" }, point: curve.b },
    {
      kind: "midpoint",
      curve: curve.id,
      point: curve.kind === "bezier" ? bezierAt(curve, 0.5) : midpoint(curve.a, curve.b),
    },
  ];
}

function groupPoints(sketch: Sketch, group: EditingGroup): PointHit[] {
  return [
    ...rectangleHandles(sketch, group).map(({ point, handle }) => ({
      kind: "handle" as const,
      group,
      handle,
      point,
    })),
    { kind: "center", group, point: rectangleFrame(sketch, group).center },
  ];
}

export function pointHits(sketch: Sketch): PointHit[] {
  const grouped = new Set(sketch.groups.flatMap((group) => group.members));
  return [
    ...sketch.curves.flatMap((curve) => (grouped.has(curve.id) ? [] : curvePoints(curve))),
    ...sketch.groups.flatMap((group) => groupPoints(sketch, group)),
  ];
}

export function resolvePointTargets(sketch: Sketch, targets: readonly PointTarget[]): PointHit[] {
  // Selection queries run inside drawing/layout loops. Resolve only the requested
  // owners; constructing every visible handle here makes basic drawing quadratic.
  return targets.flatMap((target) => {
    let available: PointHit[];
    if ("group" in target) {
      const group = sketch.groups.find((group) => group.id === target.group);
      available = group ? groupPoints(sketch, group) : [];
    } else {
      if (sketch.groups.some((group) => group.members.includes(target.curve))) return [];
      const curve = sketch.curves.find((curve) => curve.id === target.curve);
      available = curve ? curvePoints(curve) : [];
    }
    const hit = available.find((point) => pointKey(point) === targetKey(target));
    return hit ? [hit] : [];
  });
}
