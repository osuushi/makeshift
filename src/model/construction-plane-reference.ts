import { planeThroughGuides, selectedGuides } from "../guides/selection.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneFrame } from "../sketch/planes.js";

/** Copy a selected reference once; planes do not depend on later reference edits. */
export function constructionPlaneReference(
  editor: SketchEditor,
  reference?: PlaneFrame,
): PlaneFrame | null {
  const guides = [...selectedGuides(editor)];
  if (guides.length) return planeThroughGuides(editor.display, guides);
  if (reference) return structuredClone(reference);
  const selected = editor.modeling.targets;
  const target = selected.length === 1 ? selected[0] : undefined;
  const frame =
    target?.kind === "face"
      ? editor.store.data.bodies
          ?.find((b) => b.id === target.body)
          ?.faces.find((f) => f.id === target.face)?.plane
      : null;
  return frame ? structuredClone(frame) : null;
}
