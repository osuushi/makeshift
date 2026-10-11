import type { InteractionLease } from "../sketch/active-interaction.js";
import type { Extrusion } from "./body.js";
import type { ExtrudeTargets } from "./extrude-targets.js";
import type { ExtrudeTwist } from "./extrude-twist.js";
import type { ExtrudeWidget } from "./extrude-widget.js";

type Parameters = Pick<Extrusion, "distance" | "symmetric" | "mode">;

/** Parameter Undo restores fields, local axis and targets before regenerating. */
export function trackExtrudeHistory(
  lease: InteractionLease | null,
  widget: ExtrudeWidget,
  twist: ExtrudeTwist,
  targets: ExtrudeTargets,
  read: () => Parameters,
  restore: (parameters: Parameters) => Promise<void>,
): void {
  lease?.trackHistory(
    widget.root,
    () => ({
      ...read(),
      quantity: widget.quantity.mode,
      draft: widget.draft.value,
      angle: twist.angle,
      origin: twist.origin,
      targets: targets.selected,
    }),
    async (state) => {
      widget.quantity.setMode(state.quantity);
      widget.draft.restore(state.draft);
      twist.angle = state.angle;
      twist.origin = state.origin;
      twist.input.value = String(state.angle);
      targets.selected = state.targets;
      widget.input.value = String(widget.quantity.display(state.distance));
      await restore(state);
    },
  );
}
