import * as THREE from "three";
import type { DisplayDocument } from "../model/display-document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, type PlaneId, planes, type Vector } from "../sketch/planes.js";
import type { GuideMoveTarget } from "./move-target.js";

export function projectToPlane(point: Vector, frame: PlaneFrame): Vector {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    new THREE.Vector3(...frame.u).cross(new THREE.Vector3(...frame.v)).normalize(),
    new THREE.Vector3(...frame.origin),
  );
  return plane.projectPoint(new THREE.Vector3(...point), new THREE.Vector3()).toArray() as Vector;
}

/** Freeze normal destinations independently of where the pointer crosses a surface. */
export function guideMovePlanes(
  editor: SketchEditor,
  document: DisplayDocument,
  origin: Vector,
  sketchPlane?: PlaneFrame,
): GuideMoveTarget[] {
  const targets: GuideMoveTarget[] = [];
  const add = (frame: PlaneFrame, label: string, reference: GuideMoveTarget["reference"]) => {
    if (
      sketchPlane &&
      Math.abs(
        new THREE.Vector3(...frame.u)
          .cross(new THREE.Vector3(...frame.v))
          .dot(new THREE.Vector3(...sketchPlane.u).cross(new THREE.Vector3(...sketchPlane.v))),
      ) >= 1e-7
    )
      return;
    targets.push({ point: projectToPlane(origin, frame), label, reference, plane: { frame } });
  };
  for (const body of editor.bodiesVisible ? (document.bodies ?? []) : []) {
    if (!editor.visibility.visible(body.id)) continue;
    for (const face of body.faces)
      if (face.plane) add(face.plane, "Face plane", { kind: "face", body: body.id, face: face.id });
  }
  for (const [id, frame] of Object.entries(planes))
    add(frame, `${id} plane`, { kind: "plane", frame, world: id as PlaneId });
  for (const plane of document.constructionPlanes ?? [])
    if (editor.visibility.visible(plane.id))
      add(plane.frame, "Construction plane", {
        kind: "plane",
        frame: plane.frame,
        saved: plane.id,
      });
  return targets;
}
