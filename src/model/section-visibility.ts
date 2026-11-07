import * as THREE from "three";
import type { PlaneFrame } from "../sketch/planes.js";
import { sectionClip } from "../sketch/view-clipping.js";

interface SectionShell {
  readonly bounds: readonly number[];
  readonly faces: readonly ({ readonly vertices: readonly number[] } | readonly number[])[];
}

/** A hard cut must retain material, not just a boundary admitted by clip padding. */
export function sectionKeepsBody(body: SectionShell, frame: PlaneFrame | null): boolean {
  if (!frame) return true;
  const clip = sectionClip(frame);
  const tolerance = 1e-7;
  let nearest = clip.constant;
  let farthest = clip.constant;
  for (let axis = 0; axis < 3; axis++) {
    const n = clip.normal.getComponent(axis);
    nearest += n * body.bounds[axis + (n < 0 ? 3 : 0)];
    farthest += n * body.bounds[axis + (n < 0 ? 0 : 3)];
  }
  if (farthest <= tolerance) return false;
  if (nearest > tolerance) return true;
  // An oblique plane can cross the bounds box without crossing the display shell.
  const point = new THREE.Vector3();
  for (const face of body.faces) {
    const vertices = "vertices" in face ? face.vertices : face;
    for (let i = 0; i < vertices.length; i += 3)
      if (clip.distanceToPoint(point.fromArray(vertices, i)) > tolerance) return true;
  }
  return false;
}
