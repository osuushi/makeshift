import * as THREE from "three";
import type { SketchEditor } from "../sketch/editor.js";
import { minimumPlaneBounds, type PlaneBounds, planeCorners } from "../sketch/plane-bounds.js";
import { type PlaneFrame, type Point, planes } from "../sketch/planes.js";
import { pickFace } from "./body-picking.js";

/** Pick the displayed patches, not their infinite support or SVG outline. */
export function pickPlaneInterior(
  editor: SketchEditor,
  screen: Point,
  accepts: (frame: PlaneFrame) => boolean,
  faceHit: ReturnType<typeof pickFace> | null = pickFace(editor, screen),
): { frame: PlaneFrame; vertices: number[]; depth: number } | null {
  const rect = editor.world.canvas.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((screen.x - rect.left) / rect.width) * 2 - 1,
      1 - ((screen.y - rect.top) / rect.height) * 2,
    ),
    editor.world.camera,
  );
  const face =
    faceHit &&
    editor.display.bodies
      ?.find((body) => body.id === faceHit.body)
      ?.faces.find((face) => face.id === faceHit.face);
  let closest =
    faceHit && face?.plane && accepts(face.plane)
      ? { frame: face.plane, depth: faceHit.depth, vertices: face.vertices }
      : null;
  const frames = [
    ...Object.values(planes),
    ...(editor.store.data.constructionPlanes ?? [])
      .filter((plane) => editor.visibility.visible(plane.id))
      .map((plane) => plane.frame),
  ];
  for (const frame of frames) {
    if (!accepts(frame)) continue;
    const origin = new THREE.Vector3(...frame.origin);
    const u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || !editor.world.visiblePoint(hit)) continue;
    const local = hit.clone().sub(origin);
    const bounds = editor.world.planeBounds(frame);
    if (
      local.dot(u) < bounds.minX ||
      local.dot(u) > bounds.maxX ||
      local.dot(v) < bounds.minY ||
      local.dot(v) > bounds.maxY
    )
      continue;
    const depth = hit.distanceTo(editor.world.camera.position);
    if (!closest || depth < closest.depth - 1e-5)
      closest = { frame, depth, vertices: planePatchVertices(frame, bounds) };
  }
  return closest;
}

export function planePatchVertices(
  frame: PlaneFrame,
  bounds: PlaneBounds = minimumPlaneBounds(),
): number[] {
  const corners = planeCorners(frame, bounds);
  return [0, 1, 2, 0, 2, 3].flatMap((i) => corners[i]);
}
