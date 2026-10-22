import * as THREE from "three";
import { anchorPoints, visibleAnchorPoint } from "../model/anchor-snapping.js";
import { faceRayHits, screenRay } from "../model/body-ray-hits.js";
import type { DisplayDocument } from "../model/display-document.js";
import { pickPlaneInterior } from "../model/plane-interior-pick.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type Point, type Vector, worldPoint } from "../sketch/planes.js";
import { resolvedGuides } from "./evaluate.js";
import { near } from "./geometry.js";
import { guideOwner } from "./types.js";

export interface GuideMoveTarget {
  point: Vector;
  label: string;
  plane?: { frame: PlaneFrame; vertices: readonly number[] };
}
export function projectToPlane(point: Vector, frame: PlaneFrame): Vector {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize(),
    new THREE.Vector3(...frame.origin),
  );
  return plane.projectPoint(new THREE.Vector3(...point), new THREE.Vector3()).toArray() as Vector;
}

/** Point targets win over plane interiors; equal nearby world points are ambiguous. */
export function guideMoveTarget(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  screen: Point,
  sketchPlane?: PlaneFrame,
): GuideMoveTarget | null {
  const project = (point: Vector): Vector => {
    if (!sketchPlane) return point;
    const p = editor.world.project(point),
      local = editor.world.pointAt(sketchPlane, p.x, p.y);
    return local ? worldPoint(sketchPlane, local) : point;
  };
  const points = [
    ...resolvedGuides(document)
      .filter(
        ({ guide }) =>
          !guide.hidden &&
          editor.visibility.visible(guideOwner(guide.anchor)) &&
          (guide.anchor.kind === "sketch-curve" || editor.bodiesVisible),
      )
      .map(({ guide, point }) => ({ point: project(point), label: guide.name, saved: true })),
    ...anchorPoints(editor, [], document).map((point) => ({
      point: project(point),
      label: near(point, [0, 0, 0]) ? "Origin" : "Point",
      saved: false,
    })),
  ]
    .map((p) => {
      const q = editor.world.project(p.point);
      return { ...p, distance: Math.hypot(q.x - screen.x, q.y - screen.y) };
    })
    .filter(
      (p) =>
        p.distance <= 10 &&
        editor.world.visiblePoint(new THREE.Vector3(...p.point)) &&
        (p.saved || visibleAnchorPoint(editor, p.point, document.bodies)),
    )
    .sort((a, b) => a.distance - b.distance || Number(b.saved) - Number(a.saved));
  const first = points[0];
  if (first) {
    if (points.some((p) => p.distance - first.distance < 3 && !near(p.point, first.point)))
      return null;
    return first;
  }
  return planeTarget(editor, document, origin, screen, sketchPlane);
}

function planeTarget(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  screen: Point,
  sketchPlane?: PlaneFrame,
): GuideMoveTarget | null {
  const accepts = (frame: PlaneFrame) =>
    !sketchPlane ||
    Math.abs(
      new THREE.Vector3(...frame.u)
        .cross(new THREE.Vector3(...frame.v))
        .dot(new THREE.Vector3(...sketchPlane.u).cross(new THREE.Vector3(...sketchPlane.v))),
    ) < 1e-7;
  const bodies = editor.bodiesVisible
    ? (document.bodies ?? []).filter((b) => editor.visibility.visible(b.id))
    : [];
  const faceHit = faceRayHits(
    bodies,
    screenRay(editor, screen),
    editor.world.camera.position,
    editor.world.clippingAt(screen),
  )[0];
  const face =
    faceHit && bodies.find((b) => b.id === faceHit.body)?.faces.find((f) => f.id === faceHit.face);
  const patch = pickPlaneInterior(editor, screen, accepts, null);
  // An opaque curved face cannot be used as a plane or expose a plane behind it.
  if (faceHit && (!patch || faceHit.depth <= patch.depth + 1e-5))
    return face?.plane && accepts(face.plane)
      ? {
          point: projectToPlane(origin, face.plane),
          label: "Face plane",
          plane: { frame: face.plane, vertices: face.vertices },
        }
      : null;
  return patch
    ? {
        point: projectToPlane(origin, patch.frame),
        label:
          patch.source.kind === "world-plane" ? `${patch.source.id} plane` : "Construction plane",
        plane: patch,
      }
    : null;
}
