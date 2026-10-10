import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";

/** World and saved references share entry/clear keys; only saved planes can be deleted. */
export function planeSelectionKey(
  editor: SketchEditor,
  event: KeyboardEvent,
  actions: { enter: () => void; clear: () => void; remove?: () => void },
): void {
  if (
    toolCatalog(editor).reason({ reason: () => null }) ||
    event.defaultPrevented ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    (event.target instanceof HTMLElement && event.target.isContentEditable)
  )
    return;
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) return;
  if (
    event.key === "Enter" &&
    event.target instanceof HTMLButtonElement &&
    !event.target.classList.contains("entity-label")
  )
    return;
  const action =
    event.key === "Enter"
      ? actions.enter
      : event.key === "Escape"
        ? actions.clear
        : ["Delete", "Backspace"].includes(event.key)
          ? actions.remove
          : undefined;
  if (!action) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  action();
}
