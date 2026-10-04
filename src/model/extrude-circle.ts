import type { SketchEditor } from "../sketch/editor.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import { expandedSelection, selectionContext } from "./selection-context.js";

/** Recognize an exact single circular disk, never display-mesh symmetry. */
export function extrusionCircleCenter(editor: SketchEditor): Vector | undefined {
  const targets = expandedSelection(selectionContext(editor.modeling.targets, editor.store.data));
  if (targets.length !== 1) return;
  const target = targets[0];
  if (target.kind === "profile") {
    const profile = target.profile;
    const curve = profile.outer[0]?.curve;
    if (
      profile.holes.length ||
      curve?.kind !== "circle" ||
      profile.outer.some((span) => span.curve.id !== curve.id) ||
      Math.abs(
        profile.outer.reduce((sum, span) => sum + Math.abs(span.end - span.start), 0) - 2 * Math.PI,
      ) > 1e-9
    )
      return;
    const sketch = editor.store.data.sketches.find((s) => s.id === target.sketch);
    if (sketch) return worldPoint(sketch.plane, curve.center);
  } else if (target.kind === "face") {
    const body = editor.store.data.bodies?.find((b) => b.faces.some((f) => f.id === target.face));
    const face = body?.faces.find((f) => f.id === target.face);
    if (!face?.plane || new Set(face.edges).size !== 1) return;
    const curve = body?.edges.find((e) => e.id === face.edges[0])?.curve;
    if (curve?.kind === "circle") return curve.center;
  }
}
