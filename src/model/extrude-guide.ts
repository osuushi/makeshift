import { faceGuidePath, planarGuidePath } from "../guides/tool-path.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { extrusionAxis } from "./extrude-axis.js";

/** Guide handles lie on a source support, including its untrimmed plane/cylinder extension. */
export function extrusionGuidePath(
  editor: SketchEditor,
  point: Vector,
  axis: ReturnType<typeof extrusionAxis>,
  symmetric = false,
) {
  // Eligibility can be queried before the widget refreshes after a selection change.
  if (editor.interactions.current?.kind !== "extrude") axis = extrusionAxis(editor);
  const resolution = editor.modeling.resolve("extrude");
  if (!resolution.available || !axis) return null;
  const document = editor.store.data;
  const path =
    resolution.inputs
      .map((source) => {
        const face =
          "face" in source
            ? document.bodies?.flatMap((body) => body.faces).find((f) => f.id === source.face)
            : null;
        const plane =
          face?.plane ??
          ("sketch" in source
            ? document.sketches.find((s) => s.id === source.sketch)?.plane
            : null);
        return plane
          ? planarGuidePath(point, plane, axis.normal)
          : face
            ? faceGuidePath(point, face)
            : null;
      })
      .find((p) => p) ?? null;
  return path ? { ...path, distanceScale: symmetric ? 2 : 1 } : null;
}
