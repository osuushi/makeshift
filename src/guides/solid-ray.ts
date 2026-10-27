import * as THREE from "three";
import type { BodyGeometry } from "../model/body.js";
import { faceBounds } from "../model/body-ray-hits.js";

// Read-only body geometry plus the complete ray/clipping query determines reuse.
// Widget motion alone does not change solid occlusion. A changed body object misses.
const queries = new WeakMap<BodyGeometry, Map<string, boolean>>();
export function solidOccludesRay(
  body: BodyGeometry,
  ray: THREE.Ray,
  depth: number,
  clipping: readonly THREE.Plane[],
): boolean {
  const key = [
    ...ray.origin.toArray(),
    ...ray.direction.toArray(),
    depth,
    ...clipping.flatMap((plane) => [...plane.normal.toArray(), plane.constant]),
  ].join(":");
  let cached = queries.get(body);
  if (!cached) {
    cached = new Map();
    queries.set(body, cached);
  }
  const previous = cached.get(key);
  if (previous !== undefined) return previous;
  const occluded = intersect(body, ray, depth, clipping);
  if (cached.size >= 1024) cached.delete(cached.keys().next().value as string);
  cached.set(key, occluded);
  return occluded;
}

function intersect(
  body: BodyGeometry,
  ray: THREE.Ray,
  depth: number,
  clipping: readonly THREE.Plane[],
): boolean {
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const distances: number[] = [];
  for (const face of body.faces) {
    if (!ray.intersectsBox(faceBounds(face))) continue;
    for (let i = 0; i < face.vertices.length; i += 9) {
      a.fromArray(face.vertices, i);
      b.fromArray(face.vertices, i + 3);
      c.fromArray(face.vertices, i + 6);
      if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
      const distance = hit.clone().sub(ray.origin).dot(ray.direction);
      distances.push(distance);
      if (distance < depth - 1e-4 && clipping.every((plane) => plane.distanceToPoint(hit) >= 0))
        return true;
    }
  }
  // Section caps still use all exact triangle crossings, including cavity parity.
  const unique = distances
    .sort((x, y) => x - y)
    .filter((value, i, all) => i === 0 || value - all[i - 1] > 1e-5);
  for (const plane of clipping) {
    const cap = ray.intersectPlane(plane, hit);
    if (!cap) continue;
    const distance = cap.clone().sub(ray.origin).dot(ray.direction);
    if (distance >= depth - 1e-4) continue;
    if (unique.filter((value) => value > distance + 1e-4).length % 2 === 1) return true;
  }
  return false;
}
