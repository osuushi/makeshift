import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";

export function installScaleEvents(
  editor: SketchEditor,
  signal: AbortSignal,
  active: () => boolean,
  cancel: () => Promise<void>,
  finish: () => Promise<boolean>,
): void {
  const options = { signal, capture: true };
  for (const type of ["pointerdown", "click", "dblclick"] as const)
    editor.world.canvas.addEventListener(
      type,
      (event) => {
        if (!active() || event.button || event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
  onModelKeydown((event) => {
    if (!active() || !["Escape", "Enter"].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === "Escape") void cancel();
    else void finish();
  }, options);
}
