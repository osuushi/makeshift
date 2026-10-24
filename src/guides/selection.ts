import * as THREE from "three";
import type { DisplayDocument } from "../model/display-document.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame, Vector } from "../sketch/planes.js";
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
export function planeThroughGuides(document: DisplayDocument, ids: readonly string[]): PlaneFrame {
  if (ids.length !== 3) throw new Error("Select three guide points for a construction plane");
  const points = ids.map((id) => {
    const guide = document.guidePoints?.find((p) => p.id === id);
    const point = guide && guidePosition(document, guide.anchor);
    if (!point) throw new Error("A selected guide point is no longer available");
    return new THREE.Vector3(...point);
  });
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
    planeThroughGuides(editor.display, [...selectedGuides(editor)]);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}
