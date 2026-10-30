import * as THREE from "three";
import { canonicalPlanes } from "../../preferences/canonical-planes.js";
import { smallPlanePatch } from "../plane-patch-style.js";
import type { Vector } from "../planes.js";

/** A circular foot perpendicular to the real axis, attached to the readable arrow's tail. */
export function arrowBase(
  camera: THREE.Camera,
  axis: Vector,
  displayedAxis: THREE.Vector3,
): string {
  const normal = new THREE.Vector3(...axis).normalize();
  const reference =
    Math.abs(normal.x) < 0.8 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = reference.addScaledVector(normal, -reference.dot(normal)).normalize();
  const v = normal.clone().cross(u);
  const inverse = camera.quaternion.clone().invert();
  const foot = displayedAxis.clone().multiplyScalar(-14);
  const colors = canonicalPlanes().colors;
  const color =
    Math.abs(normal.x) > 0.999
      ? colors.YZ
      : Math.abs(normal.y) > 0.999
        ? colors.XZ
        : Math.abs(normal.z) > 0.999
          ? colors.XY
          : "#8b5cf6";
  u.applyQuaternion(inverse);
  v.applyQuaternion(inverse);
  return `<g class="move-arrow-base" transform="matrix(${u.x} ${-u.y} ${v.x} ${-v.y} ${foot.x} ${-foot.y})" pointer-events="none" aria-hidden="true">${smallPlanePatch(color, 38)}</g>`;
}
