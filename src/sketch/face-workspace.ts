import { samePlane } from "./document.js";
import type { SketchEditor } from "./editor.js";
import type { Point } from "./planes.js";
import { planarFraming } from "./profile-framing.js";

/** A face collection supplies temporary framing, never sketch geometry. */
export function selectedFaceWorkspace(editor: SketchEditor) {
  const targets = editor.modeling.targets;
  if (!targets.length || targets.some((target) => target.kind !== "face")) return null;
  const faces = targets.map((target) =>
    target.kind === "face"
      ? editor.display.bodies
          ?.find((body) => body.id === target.body)
          ?.faces.find((face) => face.id === target.face)
      : undefined,
  );
  const frame = faces[0]?.plane;
  if (!frame || faces.some((face) => !face?.plane || !samePlane(frame, face.plane))) return null;
  const points: Point[] = [];
  for (const face of faces) {
    if (!face) continue;
    for (let i = 0; i < face.vertices.length; i += 3) {
      const delta = face.vertices.slice(i, i + 3).map((value, axis) => value - frame.origin[axis]);
      points.push({
        x: delta.reduce((sum, value, axis) => sum + value * frame.u[axis], 0),
        y: delta.reduce((sum, value, axis) => sum + value * frame.v[axis], 0),
      });
    }
  }
  return { frame, framing: points.length ? planarFraming(editor, frame, points) : undefined };
}
