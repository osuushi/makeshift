import "./control-menu.css";
import { type ControlMode, controlMode, setControlMode } from "./control-preference.js";
import { installTouchToggle, touchHint } from "./touch-toggle.js";

export function installControlMenu(app: HTMLElement, tablet?: () => Promise<void>): void {
  const root = document.createElement("div");
  root.className = "control-selector";
  const button = document.createElement("button");
  button.title = "Controls";
  button.setAttribute("aria-expanded", "false");
  const panel = document.createElement("div");
  panel.className = "control-menu";
  panel.id = "control-menu";
  panel.popover = "auto";
  button.popoverTargetElement = panel;
  button.setAttribute("aria-controls", panel.id);
  const group = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Controls";
  group.append(legend);
  const updateHint = () => {
    button.textContent = touchHint()
      ? "Touch / Pencil"
      : controlMode() === "mouse"
        ? "Mouse"
        : "Trackpad";
    const hint = app.querySelector(".navigation-hint");
    if (hint)
      hint.textContent =
        touchHint() ??
        (controlMode() === "mouse"
          ? "Wheel · zoom   Middle-drag · pan   Shift-middle-drag · orbit (+Option · roll)   Hold · choose overlap"
          : "Two-finger scroll · pan   ⌘-drag · orbit (+Option · roll)   Pinch · zoom   Hold · choose overlap");
  };
  updateHint();
  for (const value of ["trackpad", "mouse"] as const) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "control-mode";
    input.value = value;
    input.checked = controlMode() === value;
    input.onchange = () => {
      setControlMode(input.value as ControlMode);
      updateHint();
    };
    label.append(input, value === "mouse" ? "Mouse" : "Trackpad");
    group.append(label);
  }
  panel.append(group);
  if (tablet) installTabletAction(panel, button, tablet);
  panel.addEventListener("beforetoggle", (event) => {
    const open = (event as ToggleEvent).newState === "open";
    button.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const bounds = button.getBoundingClientRect();
    panel.style.top = `${bounds.bottom + 8}px`;
    panel.style.right = `${Math.max(8, window.innerWidth - bounds.right)}px`;
  });
  panel.addEventListener("toggle", () => {
    const open = panel.matches(":popover-open");
    if (open) {
      panel.querySelector<HTMLInputElement>("input:checked")?.focus();
    }
  });
  root.append(button, panel);
  installTouchToggle(root, updateHint);
  app.querySelector("header")?.append(root);
}

function installTabletAction(
  panel: HTMLElement,
  button: HTMLButtonElement,
  tablet: () => Promise<void>,
): void {
  panel.append(document.createElement("hr"));
  const action = document.createElement("button");
  action.textContent = "Tablet";
  action.onclick = async () => {
    panel.hidePopover();
    button.disabled = true;
    try {
      await tablet();
    } finally {
      button.disabled = false;
    }
  };
  panel.append(action);
}
