import * as THREE from "three";
import type { PlaneBounds } from "./plane-bounds.js";
import type { PlaneFrame } from "./planes.js";
import type { World } from "./world.js";

/** Cover the current orthographic viewport, including when the origin is offscreen. */
export function canonicalPlaneBounds(world: World, frame: PlaneFrame): PlaneBounds {
  const u = new THREE.Vector3(...frame.u),
    v = new THREE.Vector3(...frame.v);
  const normal = u.clone().cross(v);
  const facing = Math.abs(world.camera.getWorldDirection(new THREE.Vector3()).dot(normal));
  const aspect = world.canvas.clientWidth / Math.max(1, world.canvas.clientHeight);
  const radius = (world.height * Math.max(1, aspect)) / Math.max(0.001, facing);
  const center = planeViewCenter(world.camera, world.target, frame);
  const x = center.dot(u),
    y = center.dot(v);
  return { minX: x - radius, maxX: x + radius, minY: y - radius, maxY: y + radius };
}
export function canonicalPlaneSelectable(world: World, id: import("./planes.js").PlaneId): boolean {
  const state = world.canonicalVisibility.states[id];
  return !world.active && state.selectable;
}

/** The central viewing ray's intersection, rather than the target's normal projection. */
export function planeViewCenter(
  camera: THREE.Camera,
  target: THREE.Vector3,
  frame: PlaneFrame,
): THREE.Vector3 {
  const relative = target.clone().sub(new THREE.Vector3(...frame.origin));
  const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v));
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const facing = direction.dot(normal);
  if (Math.abs(facing) > 1e-8) relative.addScaledVector(direction, -relative.dot(normal) / facing);
  return relative;
}
