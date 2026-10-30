import type * as THREE from "three";
import { arrowPoint, readableWidgetFrame } from "../../model/widget-projection.js";
import type { Vector } from "../planes.js";
import { arrowBase } from "./arrow-base.js";
import { rotationPlaneCue } from "./plane-cue.js";

type Point = readonly [number, number];

// Capsule centerlines retain the proportions of the founder's arrow.3mf.
const arrow: Point[][] = [
  [
    [-14, 0],
    [14, 0],
  ],
  [
    [2, -10],
    [14, 0],
    [2, 10],
  ],
];
// Founder fixture 2026-09-21T14-13-09-271Z-eb7ed86d: a 270° ring
// (inner radius 12, outer 16), round tail, and a filled triangular head.
// Reconstruct from its analytic sketch; the fixture's invalid body mesh is unused.
const ring: Point[] = Array.from({ length: 65 }, (_, i) => {
  const angle = Math.PI + (Math.PI * 1.5 * i) / 64;
  return [14 * Math.cos(angle), 14 * Math.sin(angle)] as Point;
});
const head: Point[] = [
  [0, 8],
  [-6, 14],
  [0, 20],
];

/** Orthographic silhouette of sphere-swept segments and a rounded head.
 * Projecting a capsule yields a round stroke of unchanged radius. Rendering
 * all outer silhouettes before their fills merges joins without internal seams.
 */
export function markerMarkup(
  camera: THREE.Camera,
  u: Vector,
  v: Vector,
  rotate: boolean,
  plane = false,
): string {
  const { u: a, v: b } = readableWidgetFrame(camera, u, v);
  const scale = rotate ? 0.65 : 1;
  const path = (points: Point[], closed = false, arrowHead = false) =>
    points
      .map(([x, y], i) => {
        const p =
          !rotate && arrowHead
            ? arrowPoint(a, a.clone().multiplyScalar(14), x - 14, y)
            : closed
              ? arrowPoint(a, b.clone().multiplyScalar(14 * scale), x * scale, (y - 14) * scale)
              : a
                  .clone()
                  .multiplyScalar(x * scale)
                  .addScaledVector(b, y * scale);
        return `${i ? "L" : "M"}${p.x},${-p.y}`;
      })
      .join(" ") + (closed ? "Z" : "");
  const strokes = (rotate ? [ring] : arrow).map((points, index) =>
    path(points, false, index === 1),
  );
  const triangle = rotate ? path(head, true) : null;
  const layer = (outline: boolean) => {
    const color = outline ? "#151515" : "#fff";
    const width = 4 * scale + (outline ? 3 : 0);
    return (
      strokes
        .map((d) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"/>`)
        .join("") +
      (triangle
        ? `<path d="${triangle}" fill="${color}" stroke="${color}" stroke-width="${outline ? 3.6 : 0.6}"/>`
        : "")
    );
  };
  const cue = plane ? (rotate ? rotationPlaneCue(camera, u, v) : arrowBase(camera, u, a)) : "";
  return `<svg viewBox="-24 -24 48 48" aria-hidden="true" stroke-linecap="round" stroke-linejoin="round">${cue}${layer(true)}${layer(false)}</svg>`;
}
