import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { profileAt } from "../sketch/profiles.js";
import type { CircularPlacement } from "./circular-primitive-controls.js";
import type { RevolveControls } from "./revolve-controls.js";
import { sphereSketch } from "./sphere-sketch.js";

export async function createSphere(
  editor: SketchEditor,
  revolve: RevolveControls,
  placement: CircularPlacement,
  lease: InteractionLease,
): Promise<boolean> {
  const view = editor.world.target.clone().sub(editor.world.camera.position).normalize();
  const { sketch, axis, probe } = sphereSketch(placement, view.toArray() as Vector);
  const success = await editor.editSketch(sketch, { kind: "direct" }, lease);
  lease.release();
  if (!success) return false;
  const accepted = editor.store.data.sketches.find((item) => item.id === sketch.id);
  const profile = accepted && profileAt(accepted, probe);
  if (!profile) {
    editor.message = "The circle and diameter have no half-circle region to revolve";
    editor.refresh();
    return false;
  }
  editor.modeling.targets = [{ kind: "profile", sketch: sketch.id, profile }];
  if (revolve.start(axis, "union")) return true;
  editor.message = "Select the half-circle region to revolve";
  editor.refresh();
  return false;
}
