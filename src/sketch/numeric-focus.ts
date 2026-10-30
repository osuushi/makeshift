import { widgetField } from "./widget-numeric-field.js";

const widgets =
  ".fillet-guide-hit, .orientable-handle, .body-axis-handle, .transform-box-handle, [data-move-marker]";
const fields = 'input[inputmode="decimal"], input[type="number"]';
let lastTarget: Element | null = null;
function clearWidgetHighlight(): void {
  document.querySelectorAll(".keyboard-widget-active").forEach((node) => {
    node.classList.remove("keyboard-widget-active");
  });
  delete document.documentElement.dataset.keyboardSketchWidget;
}
export function highlightWidget(target: Element | null): void {
  lastTarget = target;
  clearWidgetHighlight();
  if (!target?.matches(widgets) || target.matches(":disabled")) return;
  target.classList.add("keyboard-widget-active");
  if (target.hasAttribute("data-move-marker"))
    document.documentElement.dataset.keyboardSketchWidget =
      target.getAttribute("data-move-marker") ?? "";
}
window.addEventListener("blur", clearWidgetHighlight);
window.addEventListener(
  "keydown",
  (event) => {
    if (event.key === "Escape" || event.key === "Enter") clearWidgetHighlight();
  },
  true,
);
document.addEventListener(
  "pointerdown",
  (event) => {
    if (lastTarget && event.target === widgetField(lastTarget)) return;
    const target = event.target instanceof Element ? event.target.closest(widgets) : null;
    highlightWidget(event.button === 0 ? target : null);
  },
  true,
);

/** Tab visits widget quantities, first refining the last pointer gesture. */
export function focusNumericField(root: ParentNode, reverse = false, numericOnly = false): boolean {
  const targets = [...root.querySelectorAll<Element>(`${widgets}, ${fields}`)].filter((target) => {
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
  const currentField = lastTarget && widgetField(lastTarget);
  if (currentField && targets.includes(currentField) && active !== currentField) {
    currentField.focus();
    currentField.select();
    return true;
  }
  // Do not visit a handle and then its field a second time in the same cycle.
  const associated = new Set(targets.filter((target) => target.matches(widgets)).map(widgetField));
  const stops = targets.filter((target) => !associated.has(target as HTMLInputElement));
  if (!numericOnly && stops.length) targets.splice(0, targets.length, ...stops);
  const fromWidget = lastTarget?.matches(widgets) && targets.includes(lastTarget);
  const activeWidget = targets.find((target) => widgetField(target) === active);
  const index = targets.indexOf(
    fromWidget ? (lastTarget as Element) : (activeWidget ?? (active as Element)),
  );
  const next =
    index < 0
      ? reverse
        ? targets.length - 1
        : 0
      : (index + (reverse ? -1 : 1) + targets.length) % targets.length;
  const target = targets[next];
  if (
    target === lastTarget &&
    currentField &&
    currentField.isConnected &&
    !currentField.closest("[hidden]")
  ) {
    currentField.focus();
    currentField.select();
    return true;
  }
  highlightWidget(target);
  if (target.matches("[data-move-marker]")) {
    target.dispatchEvent(new Event("widget-numeric-activate"));
  } else if (target.matches(widgets)) {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  } else if (target instanceof HTMLElement) {
    target.focus();
    if (target instanceof HTMLInputElement && target.matches(fields)) target.select();
  }
  return true;
}
