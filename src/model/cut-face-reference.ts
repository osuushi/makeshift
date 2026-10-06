import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame, Point } from "../sketch/planes.js";
import { pickFace } from "./body-picking.js";
import type { PlaneCut } from "./plane-cut.js";
import { pickPlaneInterior } from "./plane-interior-pick.js";

export interface CutFacePicker {
  accepts: (surface: NonNullable<PlaneCut["surface"]>) => boolean;
  choose: (surface: NonNullable<PlaneCut["surface"]>) => void;
}

/** Curved reference faces compete with plane patches at their actual visible depth. */
export function pickCutReference(
  editor: SketchEditor,
  screen: Point,
  accepts: (frame: PlaneFrame) => boolean,
  faces?: CutFacePicker,
) {
  if (!faces) return pickPlaneInterior(editor, screen, accepts);
  const hit = pickFace(editor, screen);
  const plane = pickPlaneInterior(editor, screen, accepts, hit ?? null);
  const face =
    hit &&
    editor.display.bodies
      ?.find((body) => body.id === hit.body)
      ?.faces.find((face) => face.id === hit.face);
  if (!hit || !face || face.plane || !faces.accepts(hit)) return plane;
  return !plane || hit.depth <= plane.depth + 1e-5
    ? { surface: { body: hit.body, face: hit.face }, vertices: face.vertices, depth: hit.depth }
    : plane;
}
