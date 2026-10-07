import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneId, planes } from "../sketch/planes.js";
import type { ConstructionPlane } from "./construction-plane.js";
import type { ConstructionPlaneView } from "./construction-plane-view.js";
import type { PlaneReferencePicker } from "./plane-reference-picker.js";

/** Plane selection accepts finishable geometry previews like ordinary model selection. */
export async function selectReferencePlane(
  editor: SketchEditor,
  picker: PlaneReferencePicker,
  view: ConstructionPlaneView,
  plane: ConstructionPlane | PlaneId,
  entering?: () => boolean,
): Promise<void> {
  if (editor.blocked) return;
  if (picker.choose) {
    picker.choose(
      structuredClone(typeof plane === "string" ? planes[plane] : plane.frame),
      typeof plane === "string"
        ? { kind: "world-plane", id: plane }
        : { kind: "plane", id: plane.id },
    );
    return;
  }
  const interaction = editor.interactions.current;
  // Boolean viewport clicks belong to operand collection, including empty space.
  if (interaction?.kind === "body-boolean") return;
  if (interaction && (!interaction.finish || !(await interaction.finish()))) return;
  if (editor.interactions.current) return;
  // A double-click is one workspace-entry intent. Keep the pre-entry model
  // selection for navigation Undo while the first click finishes its preview.
  if (entering?.()) return;
  editor.world.exit();
  editor.modeling.targets = [];
  view.selected = typeof plane === "string" ? null : plane.id;
  editor.world.selectedPlane = typeof plane === "string" ? plane : null;
  editor.modeling.alternatives = [];
  editor.refresh();
}
