import { toolMenuOpen } from "../tools/menu-focus.js";
/** CAD shortcuts leave embedded agents and native modal dialogs in control of their keys. */
export function onModelKeydown(
  handler: (event: KeyboardEvent) => void,
  options?: AddEventListenerOptions,
): void {
  window.addEventListener(
    "keydown",
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
        ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f")
      )
        return;
      handler(event);
    },
    options,
  );
}
