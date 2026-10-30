import * as THREE from "three";
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
  const outline = Array.from({ length: 49 }, (_, i) => {
    const angle = (i * Math.PI * 2) / 48;
    const p = u
      .clone()
      .multiplyScalar(11 * Math.cos(angle))
      .addScaledVector(v, 11 * Math.sin(angle))
      .applyQuaternion(inverse)
      .add(foot);
    return `${i ? "L" : "M"}${p.x},${-p.y}`;
  }).join(" ");
  return `<path class="move-arrow-base" d="${outline} Z" fill="var(--handle-shade)" fill-opacity="0.75" stroke="var(--handle-dark)" stroke-width="1" pointer-events="none" aria-hidden="true"/>`;
}
