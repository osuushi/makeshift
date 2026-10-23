import { widgetChromeSelector } from "../model/widget-viewport.js";
import type { Point } from "../sketch/planes.js";

const widgets = [
  widgetChromeSelector,
  ".orientable-handle, .body-axis-handle, .move-control, .pivot-control, .move-anchor, .transform-box-handle",
  ".draggable-parameter-panel, .body-transform-value, .face-transform-value",
  ".tool-menu, .toolbox-flyout, .constraint-list, .point-chooser, .selection-overlap, .guide-choices, .decorator-panel, .tag-editor, dialog, [role=dialog]",
  ".control-menu, .trim-brush-controls, .measurement-readout, .cross-section-actions, .model-actions, .history-controls, .line-constraints, .point-link-actions",
].join(", ");

/** Panels and orientable controls occlude guide footprints at the same screen position. */
export function guideOverlapsWidget(
  point: Point,
  bounds: readonly DOMRectReadOnly[],
  radius = 10,
): boolean {
  return bounds.some(
    (box) =>
      point.x + radius > box.left &&
      point.x - radius < box.right &&
      point.y + radius > box.top &&
      point.y - radius < box.bottom,
  );
}

/** Observe UI layout, including panels outside the viewport overlay. */
export class GuideWidgetClearance {
  private observer: MutationObserver;
  private frame = 0;
  constructor(
    private host: HTMLElement,
    private changed: () => void,
  ) {
    this.observer = new MutationObserver((records) => {
      if (
        records.some((record) => {
          const nodes =
            record.type === "childList"
              ? [...record.addedNodes, ...record.removedNodes]
              : [record.target];
          return nodes.some(
            (node) =>
              node instanceof Element &&
              (node.matches(widgets) || !!node.closest(widgets) || !!node.querySelector(widgets)),
          );
        })
      )
        this.schedule();
    });
    this.observer.observe(host.ownerDocument.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "open"],
    });
  }
  bounds(): DOMRectReadOnly[] {
    return [...this.host.ownerDocument.querySelectorAll<HTMLElement>(widgets)].flatMap((widget) => {
      const bounds = widget.getBoundingClientRect();
      return bounds.width && bounds.height && getComputedStyle(widget).visibility !== "hidden"
        ? [bounds]
        : [];
    });
  }
  schedule(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.changed();
    });
  }
  dispose(): void {
    this.observer.disconnect();
    cancelAnimationFrame(this.frame);
  }
}
