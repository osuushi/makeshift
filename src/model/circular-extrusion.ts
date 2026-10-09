import type { InteractionLease } from "../sketch/active-interaction.js";
import { emptySketch, newId } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { profilesFor } from "../sketch/profiles.js";
import type { Extrusion } from "./body.js";
import type { CircularPlacement } from "./circular-primitive-controls.js";
import type { ExtrudeControls } from "./extrude-controls.js";

/** Accept an ordinary disk sketch, then yield to the existing editable solid tool. */
export async function circularExtrusion(
  editor: SketchEditor,
  extrude: ExtrudeControls,
  placement: CircularPlacement,
  lease: InteractionLease,
  options: {
    distance: number;
    symmetric: boolean;
    mode: Extrusion["mode"];
    draft?: Extrusion["draft"];
  },
): Promise<void> {
  const sketch = emptySketch(placement.plane);
  const circle = {
    id: newId(),
    kind: "circle" as const,
    center: placement.center,
    radius: placement.radius,
    construction: false,
  };
  const success = await editor.editSketch(
    { ...sketch, curves: [circle] },
    { kind: "direct" },
    lease,
  );
  lease.release();
  if (!success) return;
  const accepted = editor.store.data.sketches.find((item) => item.id === sketch.id);
  const profile = accepted && profilesFor(accepted)[0];
  if (!profile) {
    editor.message = "The circle has no closed region to extrude";
    editor.refresh();
    return;
  }
  editor.modeling.targets = [{ kind: "profile", sketch: sketch.id, profile }];
  if (!extrude.start(options.distance, options.symmetric, options.mode, options.draft))
    editor.message = "Select the circle region to extrude";
  else
    editor.notice = "Extrude · Adjust depth, draft or operation · Enter accepts · Escape cancels";
  editor.refresh();
}
