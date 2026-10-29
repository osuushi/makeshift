import * as THREE from "three";
import type { PlaneFrame, Vector } from "./planes.js";
import type { World } from "./world.js";

export function flipSectionFrame(frame: PlaneFrame): PlaneFrame {
  return { origin: [...frame.origin], u: [...frame.u], v: frame.v.map((n) => -n) as Vector };
}

/** Positive normal half-space remains visible, independently of camera orientation. */
export function sectionClip(frame: PlaneFrame): THREE.Plane {
  const normal = new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize();
  return new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal,
    new THREE.Vector3(...frame.origin),
  );
}

/** Keep the rear partition, including coplanar geometry, as the camera orbits. */
export function cameraSectionClip(frame: PlaneFrame, cameraPosition: THREE.Vector3): THREE.Plane {
  const clip = sectionClip(frame);
  if (clip.distanceToPoint(cameraPosition) > 0) clip.negate();
  clip.constant += 1e-4;
  return clip;
}

/** Explicit cuts remain global; automatic X-ray planes follow the selected sketch. */
export function updateViewClipping(world: World, sketchClip: THREE.Plane): void {
  const selected = world.selectionSection();
  const frame = world.crossSection ? null : (world.activeFrame ?? selected);
  world.partialSection = frame;
  if (!frame) {
    world.renderer.clippingPlanes = world.crossSection ? [sectionClip(world.crossSection)] : [];
    if (world.renderer.clippingPlanes[0]) world.renderer.clippingPlanes[0].constant += 1e-4;
    return;
  }
  sketchClip.copy(cameraSectionClip(frame, world.camera.position));
  world.renderer.clippingPlanes = [sketchClip];
}
