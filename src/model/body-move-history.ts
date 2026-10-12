import type { InteractionLease } from "../sketch/active-interaction.js";
import type { BodyTransform } from "./body.js";
import type { BodyGizmo } from "./body-gizmo.js";
import { axes } from "./body-placement.js";
import { reopenBodyTransform } from "./reopen-body-transform.js";

export type BodyMoveSession = {
  edit: BodyTransform;
  lease: InteractionLease;
  valid: boolean;
  value: number;
  axis: string;
  rotate: boolean;
  pivotOnly: boolean;
  explicitCopy: boolean;
  lastPreview: string | null;
};

export function trackBodyMoveHistory(
  session: BodyMoveSession,
  gizmo: BodyGizmo,
  preview: (value: number) => void,
): void {
  const { lease } = session;
  lease.trackHistory(
    gizmo.root,
    () => ({
      value: session.value,
      axis: session.axis,
      rotate: session.rotate,
      duplicate: session.edit.duplicate,
    }),
    (state) => {
      session.axis = state.axis;
      session.rotate = state.rotate;
      session.edit.axis = axes[state.axis];
      session.edit.duplicate = state.duplicate;
      gizmo.input.setAttribute(
        "aria-label",
        `${session.pivotOnly ? "Pivot" : state.rotate ? "Body rotation" : "Body translation"} ${state.axis}`,
      );
      gizmo.input.value = String(state.value);
      preview(state.value);
    },
  );
}

export function restoreBodyMoveSession(
  session: BodyMoveSession,
  gizmo: BodyGizmo,
  restored: BodyTransform,
): boolean {
  const parameters = reopenBodyTransform(restored);
  if (!parameters) return false;
  session.edit = structuredClone(restored);
  session.value = parameters.value;
  session.axis = parameters.axis;
  session.edit.axis = axes[parameters.axis];
  session.rotate = parameters.rotate;
  gizmo.input.value = String(parameters.value);
  gizmo.input.setAttribute(
    "aria-label",
    `Body ${parameters.rotate ? "rotation" : "translation"} ${parameters.axis}`,
  );
  return true;
}
