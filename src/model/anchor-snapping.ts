import * as THREE from "three";
import { guideSnap } from "../guides/snapping.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type Point, type Vector, worldPoint } from "../sketch/planes.js";
import { pointHits } from "../sketch/point-query.js";
import type { BodyGeometry, Face } from "./body.js";
import type { DisplayDocument } from "./display-document.js";
import { featureEdges } from "./feature-edges.js";

function faceCenter(body: BodyGeometry, face: Face): Vector | null {
  if (!face.plane) return null;
  const edges = featureEdges(body).filter((edge) => face.edges.includes(edge.id));
  if (edges.length === 1 && edges[0].curve?.kind === "circle") return edges[0].curve.center;
  if (edges.length !== 4 || !edges.every((edge) => edge.curve?.kind === "line")) return null;
  const points = edges.flatMap((edge) =>
    edge.curve?.kind === "line" ? [edge.curve.a, edge.curve.b] : [],
  );
  const unique = points.filter(
    (p, i) =>
      points.findIndex(
        (q) => new THREE.Vector3(...p).distanceTo(new THREE.Vector3(...q)) < 1e-6,
      ) === i,
  );
  if (unique.length !== 4) return null;
  const center = new THREE.Vector3();
  for (const point of unique) center.add(new THREE.Vector3(...point));
  center.multiplyScalar(0.25);
  const radii = unique.map((p) => center.distanceTo(new THREE.Vector3(...p)));
  if (Math.max(...radii) - Math.min(...radii) > 1e-6) return null;
  return center.toArray() as Vector;
}

export function anchorPoints(
  editor: SketchEditor,
  excluded: readonly string[],
  document: DisplayDocument = editor.display,
): Vector[] {
  const points: Vector[] = [[0, 0, 0]];
  for (const sketch of document.sketches) {
    if (!editor.visibility.visible(sketch.id) || excluded.includes(sketch.id)) continue;
    for (const hit of pointHits(sketch)) points.push(worldPoint(sketch.plane, hit.point));
  }
  if (!editor.bodiesVisible) return points;
  for (const body of document.bodies ?? []) {
    if (!editor.visibility.visible(body.id) || excluded.includes(body.id)) continue;
    for (const edge of featureEdges(body)) {
      if (edge.curve?.kind === "circle") continue;
      if (edge.points.length >= 6)
        points.push(edge.points.slice(0, 3) as Vector, edge.points.slice(-3) as Vector);
    }
    for (const face of body.faces) {
      const center = faceCenter(body, face);
      if (center) points.push(center);
    }
  }
  return points;
}

export function visibleAnchorPoint(
  editor: SketchEditor,
  point: Vector,
  bodies: readonly BodyGeometry[] = editor.display.bodies ?? [],
): boolean {
  if (!editor.world.visiblePoint(new THREE.Vector3(...point))) return false;
  if (!editor.bodiesVisible) return true;
  const camera = editor.world.camera;
  const p = new THREE.Vector3(...point),
    projected = p.clone().project(camera);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(projected.x, projected.y), camera);
  const distance = p.clone().sub(ray.ray.origin).dot(ray.ray.direction);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    hit = new THREE.Vector3();
  for (const body of bodies) {
    if (!editor.visibility.visible(body.id)) continue;
    for (const face of body.faces)
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (!ray.ray.intersectTriangle(a, b, c, false, hit)) continue;
        if (!editor.world.visiblePoint(hit)) continue;
        if (hit.clone().sub(ray.ray.origin).dot(ray.ray.direction) < distance - 1e-4) return false;
      }
  }
  return true;
}

/** Only genuine points of interest, never mesh tessellation vertices; screen-space priority. */
export function anchorSnap(
  editor: SketchEditor,
  screen: Point,
  plane?: { center: Vector; normal: Vector },
  excluded: readonly string[] = [],
): Vector | null {
  const snappedGuide = guideSnap(editor, screen, excluded);
  if (snappedGuide.ambiguous) return null;
  const guide = snappedGuide.point;
  if (
    guide &&
    (!plane ||
      Math.abs(
        new THREE.Vector3(...plane.normal).dot(
          new THREE.Vector3(...guide).sub(new THREE.Vector3(...plane.center)),
        ),
      ) < 1e-6)
  )
    return guide;
  const frame = editor.world.activeFrame;
  const normal = frame ? new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)) : null;
  const nearby = anchorPoints(editor, excluded)
    .filter(
      (point) =>
        !plane ||
        Math.abs(
          new THREE.Vector3(...plane.normal).dot(
            new THREE.Vector3(...point).sub(new THREE.Vector3(...plane.center)),
          ),
        ) < 1e-6,
    )
    .filter(
      (point) =>
        !normal ||
        !frame ||
        Math.abs(normal.dot(new THREE.Vector3(...point).sub(new THREE.Vector3(...frame.origin)))) <
          1e-5,
    )
    .map((point) => {
      const p = editor.world.project(point);
      return {
        point,
        distance: Math.hypot(p.x - screen.x, p.y - screen.y),
        depth: new THREE.Vector3(...point).project(editor.world.camera).z,
      };
    })
    .filter((p) => p.distance <= 10)
    .sort((a, b) => a.distance - b.distance || a.depth - b.depth);
  return nearby.find((p) => visibleAnchorPoint(editor, p.point))?.point ?? null;
}
