import type { SketchEditor } from "../sketch/editor.js";
import { pick } from "../sketch/picking.js";
import { toolCatalog } from "../tools/catalog.js";
import { BufferedPointer } from "./buffered-pointer.js";

/** Finish a scale preview before handing the same press to an arrow or sphere. */
export function installTransformHandoff(
  editor: SketchEditor,
  scaling: () => boolean,
  signal: AbortSignal,
): void {
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (!scaling() || event.button) return;
      const target = event.target;
      const widget = target instanceof Element && target.closest(".move-anchor, .body-axis-handle");
      const hit =
        target === editor.world.canvas
          ? pick(editor, { x: event.clientX, y: event.clientY })
          : null;
      if (!widget && hit?.kind !== "translate" && hit?.kind !== "rotate") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const buffer = new BufferedPointer(event, signal);
      void toolCatalog(editor)
        .activate({ reason: () => null, run: () => true })
        .then(
          (done) => {
            buffer.dispose();
            if (!done || !buffer.valid || !(target instanceof Element) || !target.isConnected)
              return;
            const { released, position: last } = buffer;
            if (released && Math.hypot(last.x - event.clientX, last.y - event.clientY) > 3) {
              target.dispatchEvent(
                buffer.event("pointerdown", { x: event.clientX, y: event.clientY }),
              );
              window.dispatchEvent(buffer.event("pointermove"));
              window.dispatchEvent(buffer.event("pointerup"));
              return;
            }
            if (released && target.matches(".move-anchor")) {
              (target as HTMLElement).click();
              return;
            }
            if (released) {
              if (target.matches(".body-axis-handle"))
                target.dispatchEvent(new Event("transform-numeric-tap"));
              return;
            }
            target.dispatchEvent(
              buffer.event("pointerdown", { x: event.clientX, y: event.clientY }),
            );
          },
          (error: unknown) => {
            buffer.dispose();
            if (!buffer.valid) return;
            editor.message = error instanceof Error ? error.message : "Transform handoff failed";
            editor.refresh();
          },
        );
    },
    { signal, capture: true },
  );
}
