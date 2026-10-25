import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";

const minimumProjection = 0.5; // sin(30 degrees)

/** Camera-space display frame only. Never feed this correction into model edits. */
export function readableWidgetFrame(camera: THREE.Camera, axis: Vector, width: Vector) {
  const inverse = camera.quaternion.clone().invert();
  const u = new THREE.Vector3(...axis).normalize().applyQuaternion(inverse);
  const v = new THREE.Vector3(...width).normalize().applyQuaternion(inverse);
  const projected = Math.hypot(u.x, u.y);
  if (projected < minimumProjection) {
    const direction =
      projected > 1e-9
        ? new THREE.Vector3(u.x / projected, u.y / projected, 0)
        : new THREE.Vector3(0, 1, 0);
    const corrected = direction.multiplyScalar(minimumProjection);
    corrected.z = Math.sign(u.z) * Math.sqrt(1 - minimumProjection ** 2);
    v.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(u, corrected));
    u.copy(corrected);
  }
  v.addScaledVector(u, -v.dot(u)).normalize();
  const facingWidth = new THREE.Vector3(-u.y, u.x, 0).normalize();
  const transverse = u.clone().cross(facingWidth);
  const cosine = v.dot(facingWidth);
  const required = minimumProjection / Math.hypot(u.x, u.y);
  if (Math.abs(cosine) < required) {
    const side = cosine < 0 ? -1 : 1;
    const depth = v.dot(transverse) < 0 ? -1 : 1;
    v.copy(facingWidth)
      .multiplyScalar(side * required)
      .addScaledVector(transverse, depth * Math.sqrt(Math.max(0, 1 - required ** 2)));
  }
  return { u, v, w: u.clone().cross(v) };
}

/** A screen-facing arrow plane, anchored at the projected tip. */
export function arrowPoint(axis: THREE.Vector3, tip: THREE.Vector3, along: number, across: number) {
  const direction = new THREE.Vector3(axis.x, axis.y, 0).normalize();
  return tip
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(new THREE.Vector3(-direction.y, direction.x, 0), across);
}
