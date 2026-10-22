import * as THREE from "three";
import { faceRayHits, screenRay } from "../model/body-ray-hits.js";
import type { DisplayDocument } from "../model/display-document.js";
import { planeInteriors } from "../model/plane-interior-pick.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame, Point, Vector } from "../sketch/planes.js";
import type { GuideMoveTarget } from "./move-target.js";

export function projectToPlane(point: Vector, frame: PlaneFrame): Vector {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize(),
    new THREE.Vector3(...frame.origin),
  );
  return plane.projectPoint(new THREE.Vector3(...point), new THREE.Vector3()).toArray() as Vector;
}

export function guideMovePlanes(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  screen: Point,
  sketchPlane?: PlaneFrame,
): { target: GuideMoveTarget; depth: number; visible: boolean }[] {
  const accepts = (frame: PlaneFrame) =>
    !sketchPlane ||
    Math.abs(
      new THREE.Vector3(...frame.u)
        .cross(new THREE.Vector3(...frame.v))
        .dot(new THREE.Vector3(...sketchPlane.u).cross(new THREE.Vector3(...sketchPlane.v))),
    ) < 1e-7;
  const bodies = (editor.bodiesVisible ? (document.bodies ?? []) : []).filter((b) =>
    editor.visibility.visible(b.id),
  );
  const hits = faceRayHits(
    bodies,
    screenRay(editor, screen),
    editor.world.camera.position,
    editor.world.clippingAt(screen),
  );
  const firstDepth = hits[0]?.depth ?? Infinity;
  const faces = hits.flatMap((hit) => {
    const face = bodies.find((b) => b.id === hit.body)?.faces.find((f) => f.id === hit.face);
    if (!face?.plane || !accepts(face.plane)) return [];
    return [
      {
        depth: hit.depth,
        visible: hit.depth <= firstDepth + 1e-5,
        target: {
          point: projectToPlane(origin, face.plane),
          label: "Face plane",
          reference: { kind: "face" as const, body: hit.body, face: hit.face },
          plane: { frame: face.plane, vertices: face.vertices },
        },
      },
    ];
  });
  const patches = planeInteriors(editor, screen, accepts, null).map((patch) => ({
    depth: patch.depth,
    visible: patch.depth < firstDepth - 1e-5,
    target: {
      point: projectToPlane(origin, patch.frame),
      label:
        patch.source.kind === "world-plane" ? `${patch.source.id} plane` : "Construction plane",
      reference: {
        kind: "plane" as const,
        frame: patch.frame,
        ...(patch.source.kind === "world-plane"
          ? { world: patch.source.id }
          : patch.source.kind === "plane"
            ? { saved: patch.source.id }
            : {}),
      },
      plane: patch,
    },
  }));
  return [...faces, ...patches].sort((a, b) => a.depth - b.depth);
}
