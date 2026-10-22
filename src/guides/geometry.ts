import * as THREE from "three";
import type { Edge, Face } from "../model/body.js";
import { arcAt, arcCircle } from "../sketch/arc-geometry.js";
import type { Curve } from "../sketch/document.js";
import { coplanar, type Point, type Vector } from "../sketch/planes.js";
import { bezierMidpoint } from "./bezier-midpoint.js";
import type { CurveFeature } from "./types.js";

export function sketchFeature(curve: Curve, feature: CurveFeature): Point | null {
  if (feature === "circle-center")
    return curve.kind === "circle"
      ? curve.center
      : curve.kind === "arc"
        ? arcCircle(curve).center
        : null;
  if (curve.kind === "circle") return null;
  if (feature === "start") return curve.a;
  if (feature === "end") return curve.b;
  if (feature !== "midpoint") return null;
  if (curve.kind === "arc") return arcAt(curve, 0.5);
  if (curve.kind === "bezier") return bezierMidpoint(curve);
  return { x: (curve.a.x + curve.b.x) / 2, y: (curve.a.y + curve.b.y) / 2 };
}
export function edgeCircle(edge: Edge): { center: Vector; radius: number } | null {
  const curve = edge.curve;
  if (curve?.kind === "circle") return curve;
  if (curve?.kind !== "arc") return null;
  const a = new THREE.Vector3(...curve.a);
  const u = new THREE.Vector3(...curve.mid).sub(a);
  const v = new THREE.Vector3(...curve.b).sub(a);
  const n = u.clone().cross(v),
    denominator = 2 * n.lengthSq();
  if (denominator < 1e-24) return null;
  const offset = v
    .clone()
    .cross(n)
    .multiplyScalar(u.lengthSq())
    .add(n.clone().cross(u).multiplyScalar(v.lengthSq()))
    .divideScalar(denominator);
  return { center: a.add(offset).toArray() as Vector, radius: offset.length() };
}
export function edgeFeature(edge: Edge, feature: CurveFeature): Vector | null {
  if (feature === "circle-center") return edgeCircle(edge)?.center ?? null;
  if (edge.landmarks) return edge.landmarks.closed ? null : edge.landmarks[feature];
  const curve = edge.curve;
  if (!curve || curve.kind === "circle") return null;
  if (feature === "start") return curve.a;
  if (feature === "end") return curve.b;
  if (feature !== "midpoint") return null;
  return curve.kind === "arc" ? curve.mid : (curve.a.map((v, i) => (v + curve.b[i]) / 2) as Vector);
}
export function near(a: Vector, b: Vector): boolean {
  return Math.hypot(...a.map((v, i) => v - b[i])) < 1e-7;
}
export function junction(edges: readonly Edge[]): Vector | null {
  if (edges.length < 2) return null;
  const ends = (edge: Edge) =>
    (["start", "end"] as const).flatMap((feature) => {
      const p = edgeFeature(edge, feature);
      return p ? [p] : [];
    });
  const points = ends(edges[0]).filter((p) => edges.every((e) => ends(e).some((q) => near(p, q))));
  // Two circular arcs can share both endpoints; that is not an unambiguous junction recipe.
  return points.length === 1 ? points[0] : null;
}
export function coplanarFaces(faces: readonly Face[]): boolean {
  const first = faces[0]?.plane;
  return !!first && faces.every((f) => f.plane && coplanar(first, f.plane));
}
export function areaCenter(faces: readonly Face[]): Vector | null {
  const total = faces.reduce((sum, f) => sum + f.signature[2], 0);
  if (!(total > 0)) return null;
  return [0, 1, 2].map(
    (i) => faces.reduce((sum, f) => sum + f.signature[3 + i] * f.signature[2], 0) / total,
  ) as Vector;
}
export function boundsCenter(boxes: readonly (readonly number[])[]): Vector | null {
  if (!boxes.length || boxes.some((b) => b.length !== 6 || !b.every(Number.isFinite))) return null;
  return [0, 1, 2].map(
    (i) => (Math.min(...boxes.map((b) => b[i])) + Math.max(...boxes.map((b) => b[i + 3]))) / 2,
  ) as Vector;
}
