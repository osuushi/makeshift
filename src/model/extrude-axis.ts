import * as THREE from "three";
import { boundaryPoints } from "../sketch/curve-spans.js";
import type { SketchEditor } from "../sketch/editor.js";
import {
  type Point,
  parallelNormals,
  planeNormal,
  type Vector,
  worldPoint,
} from "../sketch/planes.js";
import { extrusionCircleCenter } from "./extrude-circle.js";
import { expandedSelection, selectionContext } from "./selection-context.js";

/** Display anchor only; curved boundaries are tessellated independently of body geometry. */
export function extrusionAxis(
  editor: SketchEditor,
): { center: Vector; normal: Vector; coplanar: boolean; circleCenter?: Vector } | null {
  if (!editor.modeling.resolve("extrude").available) return null;
  const weighted = new THREE.Vector3();
  let total = 0;
  let normal: Vector | null = null;
  let origin: Vector | null = null;
  let coplanar = true;
  const add = (point: Vector, area: number) => {
    weighted.addScaledVector(new THREE.Vector3(...point), area);
    total += area;
  };
  for (const target of expandedSelection(
    selectionContext(editor.modeling.targets, editor.store.data),
  )) {
    const face =
      target.kind === "face"
        ? editor.store.data.bodies?.flatMap((b) => b.faces).find((f) => f.id === target.face)
        : undefined;
    const sketch =
      target.kind === "profile"
        ? editor.store.data.sketches.find((s) => s.id === target.sketch)
        : undefined;
    const plane = face?.plane ?? sketch?.plane;
    if (!plane) return null;
    const n = planeNormal(plane);
    if (normal && !parallelNormals(normal, n)) return null;
    normal ??= n;
    origin ??= plane.origin;
    const baseOrigin = origin;
    coplanar &&=
      Math.abs(n.reduce((sum, value, i) => sum + value * (plane.origin[i] - baseOrigin[i]), 0)) <
      1e-6;
    if (face) {
      for (let i = 0; i < face.vertices.length; i += 9) {
        const a = new THREE.Vector3().fromArray(face.vertices, i);
        const b = new THREE.Vector3().fromArray(face.vertices, i + 3);
        const c = new THREE.Vector3().fromArray(face.vertices, i + 6);
        const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
        add(
          a
            .add(b)
            .add(c)
            .multiplyScalar(1 / 3)
            .toArray() as Vector,
          area,
        );
      }
    } else if (target.kind === "profile") {
      for (const [index, loop] of [target.profile.outer, ...target.profile.holes].entries()) {
        const { center, area } = polygonCentroid(boundaryPoints(loop, 0.001));
        add(worldPoint(plane, center), (index === 0 ? 1 : -1) * area);
      }
    }
  }
  const circleCenter = extrusionCircleCenter(editor);
  return total > 1e-10 && normal
    ? {
        center: circleCenter ?? (weighted.divideScalar(total).toArray() as Vector),
        normal,
        coplanar,
        circleCenter,
      }
    : null;
}

function polygonCentroid(points: Point[]): { center: Point; area: number } {
  let area = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  return { center: { x: x / (3 * area), y: y / (3 * area) }, area: Math.abs(area) / 2 };
}

export function projectedAxis(editor: SketchEditor, center: Vector, normal: Vector) {
  const a = editor.world.project(center);
  const b = editor.world.project(center.map((v, i) => v + normal[i]) as Vector);
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = Math.hypot(dx, dy);
  const endOn = length < (editor.world.canvas.clientHeight / editor.world.height) * 0.15;
  return {
    x: endOn ? 0 : dx / length,
    y: endOn ? -1 : dy / length,
    scale: endOn ? editor.world.canvas.clientHeight / editor.world.height : length,
    endOn,
  };
}
