import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";

export function installConstructionPlaneEvents(
  editor: SketchEditor,
  signal: AbortSignal,
  active: () => boolean,
  picking: () => boolean,
  actions: {
    cancel: () => void;
    finish: () => Promise<boolean>;
    selectedKey: (event: KeyboardEvent) => void;
    clear: () => void;
  },
): void {
  onModelKeydown(
    (event) => {
      if (active()) {
        if (event.key === "Escape" || event.key === "Enter") event.stopImmediatePropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          actions.cancel();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          void actions.finish();
        }
      } else actions.selectedKey(event);
    },
    { capture: true, signal },
  );
  editor.world.canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (!active() && !picking() && !event.button && !event.metaKey && !event.ctrlKey) {
        actions.clear();
      }
    },
    { signal },
  );
}
