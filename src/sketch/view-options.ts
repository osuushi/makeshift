import type { SketchEditor } from "./editor.js";

/** A nonmodal settings popover anchored beneath the orientation cube. */
export function viewOptions(editor: SketchEditor) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "view-options-trigger";
  button.textContent = "View options ⌄";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  const panel = document.createElement("section");
  panel.className = "sketch-grid-panel view-options-panel";
  panel.id = "view-options-panel";
  panel.popover = "auto";
  button.popoverTargetElement = panel;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "View options");
  button.setAttribute("aria-controls", panel.id);
  const heading = document.createElement("h2");
  heading.textContent = "View options";
  panel.append(heading);
  editor.world.host.append(button, panel);
  const position = () => {
    const bounds = button.getBoundingClientRect();
    panel.style.maxHeight = `${Math.max(160, window.innerHeight - bounds.bottom - 14)}px`;
    panel.style.left = `${Math.max(8, Math.min(bounds.right - panel.offsetWidth, window.innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(bounds.bottom + 6, window.innerHeight - panel.offsetHeight - 8))}px`;
  };
  panel.addEventListener("toggle", () => {
    const open = panel.matches(":popover-open");
    button.setAttribute("aria-expanded", String(open));
    if (open) position();
    editor.world.requestDraw();
  });
  window.addEventListener("resize", position);
  return {
    button,
    panel,
    toggle: () => {
      panel.togglePopover();
      if (panel.matches(":popover-open")) {
        position();
        panel.querySelector<HTMLInputElement>("input")?.focus();
      }
    },
    hide: () => {
      panel.hidePopover();
      button.focus();
    },
    dispose: () => {
      window.removeEventListener("resize", position);
      button.remove();
      panel.remove();
    },
  };
}
