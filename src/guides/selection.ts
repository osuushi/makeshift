import * as THREE from "three";
import type { DisplayDocument } from "../model/display-document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, planeNormal, planes, type Vector } from "../sketch/planes.js";
import { guidePosition } from "./evaluate.js";

const selections = new WeakMap<SketchEditor, Set<string>>();
/** Ordered per-window guide selection; accepted guide definitions stay in the document. */
export function selectedGuides(editor: SketchEditor): Set<string> {
  let selected = selections.get(editor);
  if (!selected) {
    selected = new Set();
    selections.set(editor, selected);
  }
  return selected;
}
export function planeThroughGuides(
  document: DisplayDocument,
  ids: readonly string[],
  towardCamera?: Vector,
): PlaneFrame {
  if (ids.length !== 3 && !(ids.length === 1 && towardCamera))
    throw new Error("Select one or three guide points for a construction plane");
  const points = ids.map((id) => {
    const guide = document.guidePoints?.find((p) => p.id === id);
    const point = guide && guidePosition(document, guide.anchor);
    if (!point) throw new Error("A selected guide point is no longer available");
    return new THREE.Vector3(...point);
  });
  if (points.length === 1 && towardCamera) {
    const facing = new THREE.Vector3(...towardCamera);
    const candidates = Object.values(planes);
    const score = (frame: PlaneFrame) => new THREE.Vector3(...planeNormal(frame)).dot(facing);
    const closest = candidates.reduce((best, frame) =>
      Math.abs(score(frame)) > Math.abs(score(best)) ? frame : best,
    );
    const frame = structuredClone(closest);
    frame.origin = points[0].toArray() as Vector;
    if (score(frame) < 0) frame.v = frame.v.map((value) => -value) as Vector;
    return frame;
  }
  const u = points[1].clone().sub(points[0]),
    offset = points[2].clone().sub(points[0]);
  const normal = u.clone().cross(offset);
  if (u.length() < 1e-7 || offset.length() < 1e-7 || normal.length() / u.length() < 1e-7)
    throw new Error("Choose three distinct, non-collinear guide points");
  u.normalize();
  const v = normal.normalize().cross(u).normalize();
  return {
    origin: points[0].toArray() as Vector,
    u: u.toArray() as Vector,
    v: v.toArray() as Vector,
  };
}
export function guidePlaneReason(editor: SketchEditor): string | null {
  if (!selectedGuides(editor).size) return null;
  try {
    selectedGuidePlane(editor);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

/** Use viewing direction so panning does not change the chosen canonical plane. */
export function selectedGuidePlane(editor: SketchEditor): PlaneFrame {
  const facing = editor.world.camera.getWorldDirection(new THREE.Vector3()).negate();
  return planeThroughGuides(
    editor.display,
    [...selectedGuides(editor)],
    facing.toArray() as Vector,
  );
}
