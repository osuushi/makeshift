import * as THREE from "three";
import type { PlaneFrame } from "./planes.js";

/** Orthographic depth placement is independent of framing and the orbit pivot. */
export function fitCameraDepth(
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  height: number,
  geometry: THREE.Box3,
  references: readonly PlaneFrame[] = [],
): void {
  const bounds = geometry.clone().expandByPoint(target);
  const backward = camera.position.clone().sub(target).normalize();
  const right = camera.up.clone().cross(backward).normalize();
  const up = backward.clone().cross(right);
  // A full-view reference can intersect a corner behind the original camera.
  // Fit its viewport intersections too, without changing orthographic framing.
  for (const frame of references) {
    const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
    const facing = backward.dot(normal);
    if (Math.abs(facing) <= 1e-8) continue;
    const origin = new THREE.Vector3(...frame.origin);
    for (const x of [camera.left, camera.right])
      for (const y of [camera.bottom, camera.top]) {
        const point = target.clone().addScaledVector(right, x).addScaledVector(up, y);
        point.addScaledVector(backward, -point.clone().sub(origin).dot(normal) / facing);
        bounds.expandByPoint(point);
      }
  }
  const center = bounds.getCenter(new THREE.Vector3());
  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const radius =
    Math.abs(backward.x) * half.x + Math.abs(backward.y) * half.y + Math.abs(backward.z) * half.z;
  const depth = camera.position.clone().sub(center).dot(backward);
  const padding = Math.max(1, height * 0.05, radius * 0.01);
  // Keep every point ahead of the ray origin as well as inside the rendered slab.
  const retreat = Math.max(0, padding + camera.near - (depth - radius));
  camera.position.addScaledVector(backward, retreat);
  camera.far = Math.max(10000, depth + radius + retreat + padding);
}
