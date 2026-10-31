import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import type { BodyGeometry, Face } from "./body.js";

const bounds = new WeakMap<Face, THREE.Box3>();
// Conservative millimeter padding avoids rejecting boundary rays after projection roundoff.
const boundsPadding = 1e-7;
export function faceBounds(face: Face): THREE.Box3 {
  let box = bounds.get(face);
  if (!box) {
    box = new THREE.Box3();
    const point = new THREE.Vector3();
    for (let i = 0; i < face.vertices.length; i += 3)
      box.expandByPoint(point.fromArray(face.vertices, i));
    box.expandByScalar(boundsPadding);
    bounds.set(face, box);
  }
  return box;
}

export function screenRay(editor: SketchEditor, screen: Point): THREE.Ray {
  const rect = editor.world.canvas.getBoundingClientRect(),
    caster = new THREE.Raycaster();
  caster.setFromCamera(
    new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      1 - ((screen.y - rect.top) / rect.height) * 2,
    ),
    editor.world.camera,
  );
  return caster.ray;
}
export function faceRayHits(
  bodies: readonly BodyGeometry[],
  ray: THREE.Ray,
  camera: THREE.Vector3,
  clipping: readonly THREE.Plane[] = [],
  twoSided?: (body: string, face: string) => boolean,
) {
  const hits: { body: string; face: string; depth: number }[] = [];
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  for (const body of bodies)
    for (const face of body.faces) {
      if (!ray.intersectsBox(faceBounds(face))) continue;
      let depth = Infinity;
      const cullBack = !twoSided?.(body.id, face.id);
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (
          ray.intersectTriangle(a, b, c, cullBack, hit) &&
          clipping.every((p) => p.distanceToPoint(hit) >= 0)
        )
          depth = Math.min(depth, hit.distanceTo(camera));
      }
      if (Number.isFinite(depth)) hits.push({ body: body.id, face: face.id, depth });
    }
  return hits.sort((a, b) => a.depth - b.depth);
}
/** Curved faces need the normal next to this edge point, not a face-wide normal. */
export function edgeFacesCamera(
  body: BodyGeometry,
  edge: string,
  point: Vector,
  direction: THREE.Vector3,
): boolean {
  return body.faces
    .filter((face) => face.edges.includes(edge))
    .some((face) => localFaceFacing(face, point, direction));
}
function localFaceFacing(face: Face, point: Vector, direction: THREE.Vector3): boolean {
  const triangle = new THREE.Triangle(),
    probe = new THREE.Vector3(...point),
    nearest = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let distance = Infinity,
    front = false;
  for (let i = 0; i < face.vertices.length; i += 9) {
    triangle.a.fromArray(face.vertices, i);
    triangle.b.fromArray(face.vertices, i + 3);
    triangle.c.fromArray(face.vertices, i + 6);
    triangle.closestPointToPoint(probe, nearest);
    const d = nearest.distanceToSquared(probe);
    if (d > distance + 1e-10) continue;
    const facing = triangle.getNormal(normal).dot(direction) <= 1e-8;
    front = d < distance - 1e-10 ? facing : front || facing;
    distance = Math.min(distance, d);
  }
  return front;
}
