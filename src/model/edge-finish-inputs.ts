import { onModelKeydown } from "../sketch/model-keys.js";
import type { BodyEdgeFinishWidget } from "./body-edge-finish-widget.js";

/** Fields, mode buttons and completion keys belong to the same finish interaction. */
export function edgeFinishInputs(
  widget: BodyEdgeFinishWidget,
  signal: AbortSignal,
  actions: Parameters<BodyEdgeFinishWidget["bind"]>[1] & {
    active(): boolean;
    finish(): void;
    cancel(): void;
  },
): void {
  widget.bind(signal, actions);
  onModelKeydown(
    (event) => {
      if (!actions.active() || !["Enter", "Escape"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") actions.cancel();
      else actions.finish();
    },
    { signal, capture: true },
  );
}
