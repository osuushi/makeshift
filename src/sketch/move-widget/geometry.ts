import * as THREE from "three";
import type { Vector } from "../planes.js";

export { markerMarkup } from "./marker.js";

export const widgetRadius = 96;
export const rotationOffset = 72;
export const alignmentAngle = 12;
const canonical: Vector[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function alignedAxis(camera: THREE.Camera): number | null {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const index = canonical.findIndex(
    (axis) =>
      Math.abs(direction.dot(new THREE.Vector3(...axis))) >=
      Math.cos((alignmentAngle * Math.PI) / 180),
  );
  return index < 0 ? null : index;
}

export function uprightAxis(camera: THREE.Camera): Vector {
  const inverse = camera.quaternion.clone().invert();
  let best = canonical[2],
    score = Infinity;
  for (const axis of canonical) {
    const p = new THREE.Vector3(...axis).applyQuaternion(inverse);
    const roll = Math.atan2(Math.abs(p.x), Math.abs(p.y));
    const candidate = roll * roll - 0.25 * Math.log(Math.hypot(p.x, p.y));
    if (candidate < score) {
      best = axis;
      score = candidate;
    }
  }
  return best;
}

/** Keep the arrow head in a fixed world plane as the camera orbits. */
export function arrowWidthAxis(axis: Vector): Vector {
  const direction = new THREE.Vector3(...axis).normalize();
  const reference = canonical.reduce((best, candidate) =>
    Math.abs(direction.dot(new THREE.Vector3(...candidate))) <
    Math.abs(direction.dot(new THREE.Vector3().fromArray(best)))
      ? candidate
      : best,
  );
  return new THREE.Vector3(...reference)
    .addScaledVector(direction, -direction.dot(new THREE.Vector3(...reference)))
    .normalize()
    .toArray() as Vector;
}

export function rotationVisible(camera: THREE.Camera, normal: Vector): boolean {
  return (
    Math.abs(camera.getWorldDirection(new THREE.Vector3()).dot(new THREE.Vector3(...normal))) >
    Math.sin((alignmentAngle * Math.PI) / 180)
  );
}

/** A boundary normal adds a control only when no world axis offers the same movement. */
export function boundaryNormalVisible(normal: Vector | null): boolean {
  if (!normal) return false;
  const direction = new THREE.Vector3(...normal).normalize();
  return canonical.every(
    (axis) =>
      direction
        .clone()
        .cross(new THREE.Vector3(...axis))
        .lengthSq() > 1e-12,
  );
}
