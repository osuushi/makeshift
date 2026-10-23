import * as THREE from "three";
import type { PlaneBounds } from "../sketch/plane-bounds.js";
import { type PlaneFrame, worldPoint } from "../sketch/planes.js";

/** Saved references retain a faint grid across silhouettes where their fill is masked. */
export function planePatchGrid(
  frame: PlaneFrame,
  bounds: PlaneBounds,
  spacing: number,
): THREE.LineSegments {
  const { minX, maxX, minY, maxY } = bounds;
  const step =
    spacing * Math.max(1, Math.ceil(Math.max(maxX - minX, maxY - minY) / (spacing * 80)));
  const points: number[] = [];
  for (let x = Math.ceil(minX / step) * step; x <= maxX; x += step)
    points.push(...worldPoint(frame, { x, y: minY }), ...worldPoint(frame, { x, y: maxY }));
  for (let y = Math.ceil(minY / step) * step; y <= maxY; y += step)
    points.push(...worldPoint(frame, { x: minX, y }), ...worldPoint(frame, { x: maxX, y }));
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute(points, 3),
    ),
    new THREE.LineBasicMaterial({
      color: "#648bab",
      opacity: 0.3,
      transparent: true,
      depthWrite: false,
    }),
  );
  lines.renderOrder = 9;
  return lines;
}
