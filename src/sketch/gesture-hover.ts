import type { SketchEditor } from "./editor.js";
import { pick } from "./picking.js";
import { pointKey } from "./point-query.js";
import { openPointMenu } from "./point-selection.js";
import { snapped } from "./snapping.js";

export function hoverPointer(
  editor: SketchEditor,
  event: PointerEvent,
  canvas: HTMLCanvasElement,
): void {
  if (editor.tool === "trim") return;
  editor.pointer = { x: event.clientX, y: event.clientY };
  if (!editor.world.activeFrame) return;
  editor.hover = pick(editor, editor.pointer);
  const point = editor.world.pointAt(editor.world.activeFrame, event.clientX, event.clientY);
  if (point && editor.tool !== "select") snapped(editor, point, new Set(), event.shiftKey);
  else editor.snap = null;
  canvas.style.cursor =
    editor.placingPivot || editor.creationArmed
      ? "crosshair"
      : editor.hover?.kind === "rotate"
        ? "grab"
        : editor.hover &&
            (editor.tool === "select" ||
              !pointKey(editor.hover) ||
              pointKey(editor.hover) === editor.selected.firstPointKey)
          ? "move"
          : editor.tool === "select"
            ? "default"
            : "crosshair";
  if (event.shiftKey && editor.hover && pointKey(editor.hover))
    openPointMenu(editor, editor.hover, editor.pointer, true);
  editor.refresh();
}
