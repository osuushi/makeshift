import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { BodyGizmo } from "./body-gizmo.js";
import { CurrentTransform } from "./current-transform.js";
import type { TopologyMovement } from "./topology-movement.js";

/** Numeric transform editing keeps invalid input visible without queuing geometry. */
export function createMovementTransform(
  editor: SketchEditor,
  kind: "faces" | "edges",
  base: () => TopologyMovement | null,
  preview: (movement: TopologyMovement | null, invalid: boolean) => void,
): CurrentTransform {
  return new CurrentTransform(
    kind,
    (translation, angle) => {
      const movement = base();
      if (!movement) return;
      const invalid = ![...translation, angle].every(Number.isFinite);
      editor.notice = invalid
        ? "Enter finite current transform values"
        : `Move ${kind} · Enter to accept · Escape to cancel`;
      preview(invalid ? null : { ...movement, translation, angle }, invalid);
      editor.refresh();
    },
    () => editor.refresh(),
  );
}

export function trackMovementHistory(
  lease: InteractionLease,
  gizmo: BodyGizmo,
  transform: CurrentTransform,
  editor: SketchEditor,
  kind: "faces" | "edges",
  state: () => TopologyMovement | null,
  restore: (movement: TopologyMovement) => Promise<void>,
): void {
  lease.trackHistory(gizmo.root, state, async (movement) => {
    if (!movement) return;
    gizmo.input.value = "0";
    transform.update(movement, false, true);
    editor.notice = `Move ${kind} · Enter to accept · Escape to cancel`;
    await restore(movement);
  });
}
