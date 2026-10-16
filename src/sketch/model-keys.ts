import { toolMenuOpen } from "../tools/menu-focus.js";
import { toolSearchShortcut } from "../tools/search-shortcut.js";
/** CAD shortcuts leave embedded agents and native modal dialogs in control of their keys. */
export function onModelKeydown(
  handler: (event: KeyboardEvent) => void,
  options?: AddEventListenerOptions,
  type: "keydown" | "keypress" = "keydown",
): void {
  window.addEventListener(
    type,
    (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".parameter-panel-grip") &&
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      if (event.target instanceof Element && event.target.closest(".agent-dock, dialog[open]"))
        return;
      if (
        toolMenuOpen() ||
        document.querySelector(".control-menu:popover-open") ||
        toolSearchShortcut(event)
      )
        return;
      handler(event);
    },
    options,
  );
}
