import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { toolboxIcon } from "../tools/toolbox-icons.js";
import { repaintTransformControls } from "./transform-clearance.js";
import { transformLayerState, transformLayers } from "./transform-layers.js";
import { WidgetClearance } from "./widget-clearance.js";
import "./transform-layer-controls.css";

/** Local additive layer choices share Transform's existing edit completion route. */
export class TransformLayerControls {
  private root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.className = "transform-layers";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "Transform layers");
    for (const layer of transformLayers) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.layer = layer;
      const label = layer[0].toUpperCase() + layer.slice(1);
      button.title = label;
      button.setAttribute("aria-label", `${label} layer`);
      button.append(toolboxIcon(layer), label);
      button.onclick = () =>
        void toolCatalog(editor).activate({
          reason: () => null,
          run: () => {
            transformLayerState(editor).toggle(layer);
            editor.transformAxis = null;
            editor.transformRotation = false;
            editor.refresh();
          },
        });
      this.root.append(button);
    }
    overlay.append(this.root);
  }
  update(): void {
    const e = this.editor,
      anchor = e.transformAnchor;
    this.root.hidden = !anchor?.active;
    if (this.root.hidden || !anchor) return;
    const state = transformLayerState(e);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("button")) {
      const layer = transformLayers.find((layer) => layer === button.dataset.layer);
      const enabled = !!layer && state.enabled(layer);
      button.setAttribute("aria-pressed", String(enabled));
      button.disabled =
        e.blocked ||
        e.isDragging ||
        !!e.interactions.current?.captured ||
        (enabled && state.size === 1);
    }
    const point = e.world.project(anchor.point);
    this.root.style.left = `${point.x}px`;
    this.root.style.top = `${point.y + 120}px`;
    this.placement.fit([this.root]);
    repaintTransformControls(e);
  }
  dispose(): void {
    this.placement.dispose();
    this.root.remove();
  }
}
