import { hasTouchControls, setTouchMode, touchMode } from "./touch-preference.js";

export function touchHint(): string | null {
  if (!hasTouchControls()) return null;
  return touchMode() === "camera"
    ? "Pencil · edit   One finger · rotate   Two fingers · pan / pinch / 90° twist   Hold · choose overlap"
    : "Finger / Pencil · edit   Camera · switch to touch navigation   Hold · choose overlap";
}

export function installTouchToggle(root: HTMLElement, updateHint: () => void): void {
  if (!hasTouchControls()) return;
  const group = document.createElement("div");
  group.className = "touch-control-toggle";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Finger controls");
  const buttons = ["camera", "pointer"].map((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = mode === "camera" ? "Camera" : "Pointer";
    button.title =
      mode === "camera"
        ? "Use fingers to navigate, Pencil to edit"
        : "Use fingers or Pencil to edit";
    button.onclick = () => {
      setTouchMode(mode === "camera" ? "camera" : "pointer");
      update();
      updateHint();
    };
    group.append(button);
    return button;
  });
  const update = () => {
    for (const [index, button] of buttons.entries())
      button.setAttribute(
        "aria-pressed",
        String(touchMode() === (index === 0 ? "camera" : "pointer")),
      );
  };
  update();
  root.append(group);
}
