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

/** A coplanar exterior face survives only when its inward side retains material. */
export function sectionKeepsFace(vertices: readonly number[], frame: PlaneFrame | null): boolean {
  if (!frame) return true;
  const clip = sectionClip(frame);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  for (let i = 0; i < vertices.length; i += 9) {
    a.fromArray(vertices, i);
    b.fromArray(vertices, i + 3);
    c.fromArray(vertices, i + 6);
    const distances = [a, b, c].map((p) => clip.distanceToPoint(p));
    if (distances.some((d) => d > 1e-7)) return true;
    if (
      distances.every((d) => Math.abs(d) <= 1e-7) &&
      b.sub(a).cross(c.sub(a)).dot(clip.normal) < 0
    )
      return true;
  }
  return false;
}

const visibility = new WeakMap<
  import("./body.js").BodyGeometry,
  {
    key: string;
    faces: Set<string>;
    edges: Set<string>;
  }
>();

/** Reuse one shell classification across rendering and pointer queries. */
export function sectionVisibility(
  body: import("./body.js").BodyGeometry,
  frame: PlaneFrame | null,
) {
  const key = JSON.stringify(frame);
  const previous = visibility.get(body);
  if (previous?.key === key) return previous;
  const kept = body.faces.filter((face) => sectionKeepsFace(face.vertices, frame));
  const result = {
    key,
    faces: new Set(kept.map((face) => face.id)),
    edges: new Set(kept.flatMap((face) => face.edges)),
  };
  visibility.set(body, result);
  return result;
}

export function sectionKeepsEdge(
  body: import("./body.js").BodyGeometry,
  edge: string,
  frame: PlaneFrame | null,
): boolean {
  return !frame || sectionVisibility(body, frame).edges.has(edge);
}
