import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { BufferedPointer } from "./buffered-pointer.js";

/** A deliberate new gesture completes the released modal before acquiring its pointer. */
export function handoffModalPointer(
  editor: SketchEditor,
  event: PointerEvent,
  signal: AbortSignal,
): boolean {
  const current = editor.interactions.current;
  if (!current || current.captured || current.phase === "closing" || event.button) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (toolCatalog(editor).switching) return true;
  const target = event.target;
  const buffer = new BufferedPointer(event, signal);
  void toolCatalog(editor)
    .activate({ reason: () => null, run: () => true })
    .then(async (done) => {
      buffer.dispose();
      if (!done || !buffer.valid || !(target instanceof Element) || !target.isConnected) return;
      target.dispatchEvent(buffer.event("pointerdown", { x: event.clientX, y: event.clientY }));
      if (!buffer.released) return;
      // Sketch pointer acquisition resumes after its completion check.
      await Promise.resolve();
      target.dispatchEvent(buffer.event("pointermove"));
      target.dispatchEvent(buffer.event("pointerup"));
      if (Math.hypot(buffer.position.x - event.clientX, buffer.position.y - event.clientY) <= 3) {
        const click = (type: string, detail: number) =>
          new MouseEvent(type, {
            bubbles: true,
            clientX: buffer.position.x,
            clientY: buffer.position.y,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            detail,
          });
        // A double-click is one entry intent. An intermediate pick would clear
        // selection before workspace navigation records its input.
        target.dispatchEvent(
          click(buffer.doubleClicked ? "dblclick" : "click", buffer.doubleClicked ? 2 : 1),
        );
      }
    });
  return true;
}
