import * as THREE from "three";
import type { Vector } from "../sketch/planes.js";
import type { Body, Edge, Face } from "./body.js";

interface Sample {
  normal: THREE.Vector3;
  interior: THREE.Vector3;
  distance: number;
}

/** Stay within 0.001 mm of the closest triangle point, toward that triangle's interior. */
function localSamples(face: Face, point: THREE.Vector3): Sample[] {
  const samples: Sample[] = [];
  let best = Infinity;
  const triangle = new THREE.Triangle();
  for (let i = 0; i < face.vertices.length; i += 9) {
    triangle.a.fromArray(face.vertices, i);
    triangle.b.fromArray(face.vertices, i + 3);
    triangle.c.fromArray(face.vertices, i + 6);
    const normal = triangle.getNormal(new THREE.Vector3());
    if (normal.lengthSq() < 0.5) continue;
    const closest = triangle.closestPointToPoint(point, new THREE.Vector3());
    const distance = closest.distanceToSquared(point);
    best = Math.min(best, distance);
    const interior = triangle.getMidpoint(new THREE.Vector3()).sub(closest);
    const length = interior.length();
    if (length < 1e-12) continue;
    interior.multiplyScalar(Math.min(0.001, length * 0.01) / length);
    samples.push({ normal, interior, distance });
  }
  return samples.filter((sample) => sample.distance <= best + 1e-12);
}

/** Presentation-only size direction; the exact kernel remains geometry authority. */
export function edgeSurfaceMotion(
  body: Body,
  edge: Edge,
  point: Vector,
  outward: Vector,
): Vector | null {
  const faces = body.faces.filter((face) => face.edges.includes(edge.id));
  if (faces.length !== 2 || Math.hypot(...outward) < 1e-6) return null;
  const p = new THREE.Vector3(...point);
  const a = localSamples(faces[0], p);
  const b = localSamples(faces[1], p);
  if (!a.length || !b.length) return null;
  let sign = 0;
  for (const first of a)
    for (const second of b) {
      // Tangency and opposing/degenerate normals offer no stable corner direction.
      if (Math.abs(first.normal.dot(second.normal)) > 1 - 1e-6) return null;
      const firstSide = second.normal.dot(first.interior) / first.interior.length();
      const secondSide = first.normal.dot(second.interior) / second.interior.length();
      if (Math.abs(firstSide) < 1e-5 || Math.abs(secondSide) < 1e-5) return null;
      const next = Math.sign(firstSide);
      if (next !== Math.sign(secondSide) || (sign && sign !== next)) return null;
      sign = next;
    }
  // Behind the other support is convex (cut inward); in front is concave (fill outward).
  return outward.map((component) => component * sign) as Vector;
}
