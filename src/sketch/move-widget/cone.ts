import * as THREE from "three";
import type { Vector } from "../planes.js";

type Point = { x: number; y: number };
const basePosition = -8,
  tipPosition = 18,
  tailPosition = -20,
  baseRadius = 10;
const path = (points: Point[]) =>
  `${points.map((p, i) => `${i ? "L" : "M"}${p.x},${-p.y}`).join(" ")}Z`;

/** Hide the entire control when neither end extends beyond the projected base disk. */
export function coneVisible(camera: THREE.Camera, axis: Vector): boolean {
  const n = new THREE.Vector3(...axis)
    .normalize()
    .applyQuaternion(camera.quaternion.clone().invert());
  const along = Math.hypot(n.x, n.y);
  const rim = baseRadius * Math.abs(n.z);
  return (
    (tipPosition - basePosition) * along > rim || (basePosition - tailPosition) * along + 3.5 > rim
  );
}

/** A true-axis cone: no camera-facing head or minimum-angle display correction. */
export function coneMarkup(camera: THREE.Camera, axis: Vector): string {
  const n = new THREE.Vector3(...axis)
    .normalize()
    .applyQuaternion(camera.quaternion.clone().invert());
  const reference = Math.abs(n.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = reference.addScaledVector(n, -reference.dot(n)).normalize();
  const v = n.clone().cross(u);
  const base = n.clone().multiplyScalar(basePosition),
    tip = n.clone().multiplyScalar(tipPosition);
  const ring = Array.from({ length: 64 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 64;
    return base
      .clone()
      .addScaledVector(u, baseRadius * Math.cos(angle))
      .addScaledVector(v, baseRadius * Math.sin(angle));
  });
  const tail = n.clone().multiplyScalar(tailPosition);
  const shaftPath = `M${tail.x},${-tail.y} L${base.x},${-base.y}`;
  const stem = `<g fill="none" stroke-linecap="round"><path d="${shaftPath}" stroke="var(--handle-dark)" stroke-width="7"/><path d="${shaftPath}" stroke="var(--widget-selection-fill, var(--handle-light))" stroke-width="4"/></g>`;
  const cap =
    n.z < 0
      ? `<path d="${path(ring)}" fill="var(--widget-selection-fill, var(--handle-shade))" stroke="var(--handle-dark)" stroke-width="1.2"/>`
      : "";
  const cone = `<path d="${path(hull([...ring, tip]))}" fill="var(--widget-selection-fill, var(--handle-light))" stroke="var(--handle-dark)" stroke-width="1.5"/>${cap}`;
  // A rear-facing base exposes the stem in front; otherwise the cone hides its join.
  return `<svg viewBox="-24 -24 48 48" aria-hidden="true" stroke-linejoin="round">${n.z < 0 ? cone + stem : stem + cone}</svg>`;
}

/** Outline only the convex silhouette, never the tessellation. */
function hull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const half = (sequence: Point[]) => {
    const result: Point[] = [];
    for (const point of sequence) {
      while (
        result.length > 1 &&
        cross(result[result.length - 2], result[result.length - 1], point) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half(sorted.reverse())];
}
