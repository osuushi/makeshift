import * as THREE from "three";
import { screenRay } from "../model/body-ray-hits.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";

/** Match opaque solid surfaces and section-cap parity, excluding transparent/X-ray passes. */
export function guideVisibleThroughSolids(editor: SketchEditor, point: Vector): boolean {
  const position = new THREE.Vector3(...point);
  if (editor.world.crossSection && !editor.world.visiblePoint(position)) return false;
  if (!editor.bodiesVisible) return true;
  const screen = editor.world.project(point);
  const ray = screenRay(editor, screen);
  const clipping = editor.world.clippingAt(screen);
  const depth = position.clone().sub(ray.origin).dot(ray.direction);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  for (const body of editor.display.bodies ?? []) {
    const alpha =
      editor.display.bodyAppearances?.find((entry) => entry.body === body.id)?.alpha ?? 1;
    if (!editor.visibility.visible(body.id) || alpha < 1) continue;
    const distances: number[] = [];
    for (const face of body.faces) {
      for (let i = 0; i < face.vertices.length; i += 9) {
        a.fromArray(face.vertices, i);
        b.fromArray(face.vertices, i + 3);
        c.fromArray(face.vertices, i + 6);
        if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
        const distance = hit.clone().sub(ray.origin).dot(ray.direction);
        distances.push(distance);
        if (distance < depth - 1e-4 && clipping.every((plane) => plane.distanceToPoint(hit) >= 0))
          return false;
      }
    }
    // A cut through material draws an opaque cap even where no original face remains.
    const unique = distances
      .sort((x, y) => x - y)
      .filter((value, i, all) => i === 0 || value - all[i - 1] > 1e-5);
    for (const plane of clipping) {
      const cap = ray.intersectPlane(plane, hit);
      if (!cap) continue;
      const distance = cap.clone().sub(ray.origin).dot(ray.direction);
      if (distance >= depth - 1e-4) continue;
      if (unique.filter((value) => value > distance + 1e-4).length % 2 === 1) return false;
    }
  }
  return true;
}
