import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";
import type { Extrusion } from "./body.js";

/** Choose the camera-facing half-space; exactly edge-on prefers screen up. */
export function viewerSide(normal: Vector, camera: THREE.Camera): 1 | -1 {
  const axis = new THREE.Vector3(...normal);
  const facing = axis.dot(camera.getWorldDirection(new THREE.Vector3()));
  if (Math.abs(facing) > 1e-8) return facing < 0 ? 1 : -1;
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  return axis.dot(up) < -1e-8 ? -1 : 1;
}

/** Reversing the displayed axis reverses distance and rotation, not wall draft.
 * The conversion is its own inverse, so reopen preserves existing operation data. */
export function sourceExtrusion(extrusion: Extrusion, side: 1 | -1): Extrusion {
  return {
    ...extrusion,
    distance: extrusion.distance * side,
    twist: extrusion.twist && { ...extrusion.twist, angle: extrusion.twist.angle * side },
  };
}
