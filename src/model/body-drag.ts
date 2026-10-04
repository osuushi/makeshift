import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import { axes } from "./body-placement.js";
import { projectedAxis } from "./extrude-axis.js";
import { featureEdges } from "./feature-edges.js";

export function dragFrame(
  editor: SketchEditor,
  pivot: Vector,
  axis: string,
  x: number,
  y: number,
  vector: Vector = axes[axis],
  offset: Point = { x: 0, y: 0 },
) {
  const screen = editor.world.project(pivot),
    direction = projectedAxis(editor, pivot, vector);
  const ray = (x: number, y: number) => {
    const bounds = editor.world.canvas.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2(
        ((x - offset.x - bounds.x) / bounds.width) * 2 - 1,
        1 - ((y - offset.y - bounds.y) / bounds.height) * 2,
      ),
      editor.world.camera,
    );
    return ray.ray.intersectPlane(
      new THREE.Plane().setFromNormalAndCoplanarPoint(
        new THREE.Vector3(...vector),
        new THREE.Vector3(...pivot),
      ),
      new THREE.Vector3(),
    );
  };
  const first = ray(x, y);
  let previous = 0,
    accumulated = 0;
  return {
    translation: (X: number, Y: number) =>
      ((X - x) * direction.x + (Y - y) * direction.y) / direction.scale,
    angle: (X: number, Y: number) => {
      const next = ray(X, Y);
      if (first && next) {
        const a = first
          .clone()
          .sub(new THREE.Vector3(...pivot))
          .normalize();
        const b = next
          .clone()
          .sub(new THREE.Vector3(...pivot))
          .normalize();
        const angle =
          (Math.atan2(new THREE.Vector3(...vector).dot(a.clone().cross(b)), a.dot(b)) * 180) /
          Math.PI;
        accumulated += ((angle - previous + 540) % 360) - 180;
        previous = angle;
        return accumulated;
      }
      // An edge-on ring has no stable plane intersection; use signed screen travel.
      return X - x - (Y - y);
    },
    screen,
  };
}
export function bodySnap(
  editor: SketchEditor,
  excluded: string[],
  pivot: Vector,
  axis: string,
  value: number,
) {
  if (!editor.bodiesVisible) return null;
  const n = new THREE.Vector3(...axes[axis]),
    origin = new THREE.Vector3(...pivot);
  const wanted = editor.world.project(origin.clone().addScaledVector(n, value).toArray() as Vector);
  let best: { value: number; point: Vector; distance: number } | null = null;
  for (const body of editor.store.data.bodies ?? []) {
    if (excluded.includes(body.id) || !editor.visibility.visible(body.id)) continue;
    const candidates: THREE.Vector3[] = [];
    for (const edge of featureEdges(body)) {
      if (edge.curve?.kind === "circle") candidates.push(new THREE.Vector3(...edge.curve.center));
      for (let i = 0; i < edge.points.length; i += 3) {
        const a = new THREE.Vector3().fromArray(edge.points, i);
        candidates.push(a);
        if (edge.curve?.kind !== "line" || i + 3 >= edge.points.length) continue;
        const segment = new THREE.Vector3().fromArray(edge.points, i + 3).sub(a);
        const lateral = segment.clone().addScaledVector(n, -segment.dot(n));
        const offset = a.clone().sub(origin);
        const perpendicular = offset.clone().addScaledVector(n, -offset.dot(n));
        if (lateral.lengthSq() > 1e-14) {
          const t = -perpendicular.dot(lateral) / lateral.lengthSq();
          if (t > 0 && t < 1) candidates.push(a.clone().addScaledVector(segment, t));
        }
      }
    }
    for (const p of candidates) {
      const delta = p.clone().sub(origin),
        amount = delta.dot(n);
      if (delta.clone().addScaledVector(n, -amount).length() > 1e-6) continue;
      const screen = editor.world.project(p.toArray() as Vector),
        distance = Math.hypot(screen.x - wanted.x, screen.y - wanted.y);
      if (distance < 10 && (!best || distance < best.distance))
        best = { value: amount, point: p.toArray() as Vector, distance };
    }
  }
  return best;
}
