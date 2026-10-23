const widgets = ".orientable-handle, .body-axis-handle, .transform-box-handle, [data-move-marker]";
const panels =
  ".draggable-parameter-panel, .dimension, .transform-layers, .axial-panel, .scale-card, .edge-finish-panel, .revolve-quantity";
const fields = 'input[inputmode="decimal"], input[type="number"]';
let lastTarget: Element | null = null;
function clearWidgetHighlight(): void {
  document.querySelectorAll(".keyboard-widget-active").forEach((node) => {
    node.classList.remove("keyboard-widget-active");
  });
  delete document.documentElement.dataset.keyboardSketchWidget;
}
window.addEventListener("blur", clearWidgetHighlight);
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" || event.key === "Enter") clearWidgetHighlight();
  },
  true,
);
document.addEventListener(
  "pointerdown",
  () => {
    lastTarget = null;
    clearWidgetHighlight();
  },
  true,
);

/** Tab activates scene actions or visits controls in an already visible panel. */
export function focusNumericField(root: ParentNode, reverse = false, numericOnly = false): boolean {
  const targets = [
    ...root.querySelectorAll<Element>(
      `${widgets}, ${fields}, ${panels
        .split(",")
        .map((panel) => `${panel} :is(input, button, select, textarea)`)
        .join(",")}`,
    ),
  ].filter((target) => {
    if (numericOnly && !target.matches(fields)) return false;
    if (
      target.matches(":disabled, [readonly], .parameter-panel-grip") ||
      target.closest("[hidden], [inert]")
    )
      return false;
    const bounds = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    return (
      bounds.width > 0 &&
      bounds.height > 0 &&
      style.visibility !== "hidden" &&
      style.display !== "none"
    );
  });
  if (!targets.length) return false;
  const active = document.activeElement;
  if (lastTarget?.matches("[data-move-marker]") && !lastTarget.isConnected)
    lastTarget =
      targets.find(
        (target) =>
          target.getAttribute("data-move-marker") === lastTarget?.getAttribute("data-move-marker"),
      ) ?? null;
  const fromWidget = lastTarget?.matches(widgets) && targets.includes(lastTarget);
  const index = targets.indexOf(fromWidget ? (lastTarget as Element) : (active as Element));
  const next =
    index < 0
      ? reverse
        ? targets.length - 1
        : 0
      : (index + (reverse ? -1 : 1) + targets.length) % targets.length;
  const target = targets[next];
  lastTarget = target;
  clearWidgetHighlight();
  if (target.matches(widgets)) {
    target.classList.add("keyboard-widget-active");
    if (target.hasAttribute("data-move-marker"))
      document.documentElement.dataset.keyboardSketchWidget =
        target.getAttribute("data-move-marker") ?? "";
  }
  if (target.matches("[data-move-marker]")) {
    target.dispatchEvent(new Event("widget-numeric-activate"));
  } else if (target.matches(widgets) && target instanceof HTMLElement) {
    target.click();
  } else if (target instanceof HTMLElement) {
    target.focus();
    if (target instanceof HTMLInputElement && target.matches(fields)) target.select();
  }
  return true;
}
