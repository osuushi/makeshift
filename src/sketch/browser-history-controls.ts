import { toolCatalog } from "../tools/catalog.js";
import { toolMenuOpen } from "../tools/menu-focus.js";
import type { SketchEditor } from "./editor.js";

/** Native browser Undo may address an old text edit after focus returns to CAD. */
export function browserHistoryControls(editor: SketchEditor, signal: AbortSignal): void {
  window.addEventListener(
    "beforeinput",
    (event) => {
      const focused = document.activeElement;
      if (
        event.defaultPrevented ||
        !event.cancelable ||
        !["historyUndo", "historyRedo"].includes(event.inputType) ||
        (focused instanceof HTMLElement &&
          (focused instanceof HTMLInputElement ||
            focused instanceof HTMLTextAreaElement ||
            focused.isContentEditable ||
            focused.closest(".agent-dock, dialog[open]"))) ||
        toolMenuOpen() ||
        document.querySelector("dialog[open], .control-menu:popover-open")
      )
        return;
      // Use current focus, not the target: native history can target a previously
      // edited field even though that field no longer owns keyboard input.
      event.preventDefault();
      void toolCatalog(editor).invoke(event.inputType === "historyUndo" ? "undo" : "redo");
    },
    { signal },
  );
}
