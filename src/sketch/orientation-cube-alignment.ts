import * as THREE from "three";
import type { CubeSurface } from "./orientation-cube-geometry.js";

/** Single clicks preserve the nearest quarter-turn; double clicks request canonical roll. */
export function cubeAlignment(
  surface: CubeSurface,
  current: THREE.Quaternion,
  canonicalRoll = false,
): THREE.Quaternion {
  const canonical = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(surface.normal, new THREE.Vector3(), surface.up),
  );
  if (surface.kind !== "face" || canonicalRoll) return canonical;
  let best = canonical;
  let score = Math.abs(current.dot(best));
  for (let turn = 1; turn < 4; turn++) {
    const candidate = canonical
      .clone()
      .multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (turn * Math.PI) / 2),
      );
    const candidateScore = Math.abs(current.dot(candidate));
    if (candidateScore > score + 1e-12) {
      best = candidate;
      score = candidateScore;
    }
  }
  return best;
}
