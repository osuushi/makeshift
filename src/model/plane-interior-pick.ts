import * as THREE from "three";
import { viewDisplay } from "../preferences/view-display.js";
import {
  canonicalPlaneBounds,
  canonicalPlaneSelectable,
} from "../sketch/canonical-plane-bounds.js";
import type { SketchEditor } from "../sketch/editor.js";
import { minimumPlaneBounds, type PlaneBounds, planeCorners } from "../sketch/plane-bounds.js";
import { type PlaneFrame, type PlaneId, type Point, planes } from "../sketch/planes.js";
import { pickFace } from "./body-picking.js";

export type PlaneReferenceSource =
  | { kind: "face"; body: string; face: string }
  | { kind: "plane"; id: string }
  | { kind: "world-plane"; id: PlaneId };

/** Canonical references cover the view; saved planes retain their displayed bounds. */
export function pickPlaneInterior(
  editor: SketchEditor,
  screen: Point,
  accepts: (frame: PlaneFrame) => boolean,
  faceHit: ReturnType<typeof pickFace> | null = pickFace(editor, screen),
): { frame: PlaneFrame; vertices: number[]; depth: number; source: PlaneReferenceSource } | null {
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
  let closest: {
    frame: PlaneFrame;
    depth: number;
    vertices: number[];
    source: PlaneReferenceSource;
  } | null =
    faceHit && face?.plane && accepts(face.plane)
      ? {
          frame: face.plane,
          depth: faceHit.depth,
          vertices: face.vertices,
          source: { kind: "face", body: faceHit.body, face: faceHit.face },
        }
      : null;
  const frames = [
    ...Object.entries(planes).map(([id, frame]) => ({
      frame,
      source: { kind: "world-plane", id: id as PlaneId } as PlaneReferenceSource,
    })),
    ...(editor.store.data.constructionPlanes ?? [])
      .filter((plane) => editor.visibility.visible(plane.id))
      .map((plane) => ({
        frame: plane.frame,
        source: { kind: "plane", id: plane.id } as PlaneReferenceSource,
      })),
  ];
  for (const { frame, source } of frames) {
    if (!accepts(frame)) continue;
    if (
      source.kind === "world-plane" &&
      (!canonicalPlaneSelectable(editor.world, source.id) ||
        (viewDisplay().planes === 0 && viewDisplay().grid === 0))
    )
      continue;
    const origin = new THREE.Vector3(...frame.origin);
    const u = new THREE.Vector3(...frame.u),
      v = new THREE.Vector3(...frame.v);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(u.clone().cross(v), origin);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit || !editor.world.visiblePoint(hit)) continue;
    const local = hit.clone().sub(origin);
    const bounds =
      source.kind === "world-plane"
        ? canonicalPlaneBounds(editor.world, frame)
        : editor.world.planeBounds(frame);
    if (
      local.dot(u) < bounds.minX ||
      local.dot(u) > bounds.maxX ||
      local.dot(v) < bounds.minY ||
      local.dot(v) > bounds.maxY
    )
      continue;
    const depth = hit.distanceTo(editor.world.camera.position);
    if (!closest || depth < closest.depth - 1e-5)
      closest = { frame, depth, vertices: planePatchVertices(frame, bounds), source };
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
