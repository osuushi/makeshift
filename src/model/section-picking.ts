import * as THREE from "three";
import type { PlaneFrame } from "../sketch/planes.js";
import { sectionClip } from "../sketch/view-clipping.js";
import type { BodyGeometry } from "./body.js";

/** Pick rendered cut material, including cavities, without inventing a topology face. */
export function sectionBodyHits(
  bodies: readonly BodyGeometry[],
  ray: THREE.Ray,
  frame: PlaneFrame | null,
  camera: THREE.Vector3,
): { body: string; depth: number }[] {
  if (!frame) return [];
  const point = ray.intersectPlane(sectionClip(frame), new THREE.Vector3());
  if (!point) return [];
  const cutRay = new THREE.Ray(point, ray.direction);
  return bodies
    .filter((body) => insideShell(body, cutRay))
    .map((body) => ({
      body: body.id,
      depth: point.distanceTo(camera),
    }));
}

function insideShell(body: BodyGeometry, ray: THREE.Ray): boolean {
  const box = new THREE.Box3(
    new THREE.Vector3(...body.bounds.slice(0, 3)),
    new THREE.Vector3(...body.bounds.slice(3, 6)),
  );
  if (!box.containsPoint(ray.origin)) return false;
  const triangle = new THREE.Triangle();
  const hit = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const crossings: { depth: number; facing: number }[] = [];
  for (const face of body.faces) {
    for (let i = 0; i < face.vertices.length; i += 9) {
      triangle.a.fromArray(face.vertices, i);
      triangle.b.fromArray(face.vertices, i + 3);
      triangle.c.fromArray(face.vertices, i + 6);
      if (!ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) continue;
      const depth = hit.distanceTo(ray.origin);
      // An existing coplanar face owns boundary hits, rather than a pseudoface.
      if (depth < 1e-7) return false;
      const facing = Math.sign(triangle.getNormal(normal).dot(ray.direction));
      if (!crossings.some((c) => Math.abs(c.depth - depth) < 1e-7 && c.facing === facing))
        crossings.push({ depth, facing });
    }
  }
  return crossings.reduce((sum, crossing) => sum + crossing.facing, 0) !== 0;
}
