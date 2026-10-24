import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { FaceOffsetWidget } from "./face-offset-widget.js";
import type { OffsetQuantity } from "./offset-quantity.js";

/** Field/quantity/keyboard bindings share the Offset controller's temporary edit. */
export function faceOffsetInputs(
  editor: SketchEditor,
  widget: FaceOffsetWidget,
  quantity: OffsetQuantity,
  signal: AbortSignal,
  actions: {
    begin(): boolean;
    lease(): InteractionLease | null;
    focus(): void;
    queue(value: number): void;
    finish(): void;
    cancel(): void;
  },
): void {
  const options = { signal };
  widget.handle.addEventListener(
    "click",
    (event) => {
      if (event.detail === 0 && actions.begin()) actions.focus();
    },
    options,
  );
  widget.input.addEventListener("focus", actions.begin, options);
  widget.input.addEventListener(
    "input",
    () => {
      const value = widget.input.value.trim() ? Number(widget.input.value) : NaN;
      actions.queue(quantity.distance(value));
    },
    options,
  );
  widget.quantity.addEventListener("keydown", (event) => event.stopPropagation(), options);
  widget.quantity.addEventListener(
    "change",
    () => {
      const mode = widget.quantity.value;
      if (!actions.begin()) return;
      quantity.setMode(mode);
      widget.input.blur();
      editor.refresh();
    },
    options,
  );
  onModelKeydown(
    (event) => {
      if (event.target === widget.quantity) return;
      if (!actions.lease() || !["Enter", "Escape"].includes(event.key)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") actions.cancel();
      else actions.finish();
    },
    { ...options, capture: true },
  );
}
