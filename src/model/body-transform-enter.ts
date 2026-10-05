import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { toolCatalog } from "../tools/catalog.js";

/** Idle whole-body Enter is the same explicit Transform action as M. */
export function installBodyTransformEnter(editor: SketchEditor, signal: AbortSignal): void {
  onModelKeydown(
    (event) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        editor.world.active ||
        editor.blocked ||
        editor.isDragging ||
        editor.interactions.current ||
        !editor.modeling.targets.length ||
        !editor.modeling.targets.every((target) => target.kind === "body") ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, select, button, a[href], [contenteditable]"))
      )
        return;
      event.preventDefault();
      void toolCatalog(editor).invoke("transform");
    },
    { signal },
  );
}
