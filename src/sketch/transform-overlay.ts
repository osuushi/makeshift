import * as THREE from "three";
import { BodyPivotDrag } from "../model/body-pivot-drag.js";
import { cameraFacingWidth } from "../model/widget-frame.js";
import { uiScale } from "../preferences/ui-scale.js";
import type { SketchEditor } from "./editor.js";
import { markerMarkup } from "./move-widget/geometry.js";
import { worldPoint } from "./planes.js";
import { selectionFrame } from "./selection-frame.js";
import { sketchIcon } from "./sketch-icons.js";
import { sketchRotationVisible, transformHandles } from "./transform-handles.js";

export class TransformOverlay {
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private move = document.createElement("button");
  private pivot = document.createElement("button");
  private anchor = document.createElement("button");
  private anchorDrag: BodyPivotDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.svg.classList.add("handles");
    this.svg.setAttribute("aria-hidden", "true");
    this.pivot.className = "pivot-control";
    this.pivot.textContent = "Pivot";
    this.pivot.setAttribute("aria-label", "Place rotation pivot");
    this.pivot.addEventListener("click", () => {
      if (editor.blocked || editor.isDragging) return;
      editor.placingPivot = !editor.placingPivot;
      editor.message = editor.placingPivot ? "Click to place the rotation pivot" : "";
      editor.refresh();
    });
    this.move.className = "move-control";
    this.move.type = "button";
    this.move.setAttribute("aria-label", "Transform (M)");
    this.move.append(sketchIcon("move"), "Transform");
    this.move.addEventListener("click", () => void editor.activateMove());
    this.anchor.className = "move-anchor sketch-move-anchor";
    this.anchor.setAttribute("aria-label", "Reposition sketch pivot");
    this.anchor.title = "Drag anchor · Command for free placement";
    this.anchorDrag = new BodyPivotDrag(
      editor,
      this.anchor,
      () => {
        const sketch = editor.sketch,
          frame = selectionFrame(editor);
        return sketch && frame ? worldPoint(sketch.plane, frame.pivot) : [0, 0, 0];
      },
      (point) => {
        const frame = editor.sketch?.plane;
        if (!frame) return;
        const delta = new THREE.Vector3(...point).sub(new THREE.Vector3(...frame.origin));
        editor.pivot = {
          x: delta.dot(new THREE.Vector3(...frame.u)),
          y: delta.dot(new THREE.Vector3(...frame.v)),
        };
        editor.refresh();
      },
      () => {},
    );
    overlay.append(this.svg, this.pivot, this.move, this.anchor);
    editor.world.changed.add(this.update);
    this.update();
  }
  private node(tag: string, attributes: Record<string, string | number>): Element {
    const node = document.createElementNS(this.svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    this.svg.append(node);
    return node;
  }
  private update = (): void => {
    const e = this.editor,
      sketch = e.sketch,
      frame = selectionFrame(e),
      r = e.world.canvas.getBoundingClientRect();
    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    this.move.hidden = !frame || e.isDragging || e.moveMode;
    this.move.disabled = e.blocked;
    this.move.setAttribute("aria-pressed", String(e.moveMode));
    if (sketch && frame) {
      const pos = e.world.projectLocal(sketch.plane, frame.center);
      this.move.style.left = `${pos.x - r.left + 40}px`;
      this.move.style.top = `${pos.y - r.top + 40}px`;
    }
    this.anchor.hidden = !transformHandles(e) || !!e.pointMenu;
    this.pivot.hidden =
      !!transformHandles(e) || !frame || (!!e.circle && !e.moveMode) || !!e.pointMenu;
    if (!sketch || !frame || (e.circle && !e.moveMode) || e.pointMenu) return;
    const project = (p: { x: number; y: number }) => {
      const s = e.world.projectLocal(sketch.plane, p);
      return { x: s.x - r.left, y: s.y - r.top };
    };
    const c = project(frame.pivot),
      p = project(frame.handle),
      widget = transformHandles(e);
    if (widget) {
      e.transformAnchor = { point: worldPoint(sketch.plane, frame.pivot), active: e.moveMode };
      this.anchor.style.left = `${c.x}px`;
      this.anchor.style.top = `${c.y}px`;
      if (widget.rotationVisible)
        this.marker(
          p.x,
          p.y,
          markerMarkup(e.world.camera, sketch.plane.u, sketch.plane.v, true),
          "rotation",
        );
      for (const h of widget.axes) {
        const tip = project(h.point);
        const u = h.axis === "x" ? sketch.plane.u : sketch.plane.v;
        const v = cameraFacingWidth(e.world.camera, u);
        this.marker(tip.x, tip.y, markerMarkup(e.world.camera, u, v, false), h.axis);
      }
    } else if (sketchRotationVisible(e)) {
      this.node("line", { x1: c.x, y1: c.y, x2: p.x, y2: p.y, class: "rotation-guide" });
      this.marker(
        p.x,
        p.y,
        markerMarkup(e.world.camera, sketch.plane.u, sketch.plane.v, true),
        "rotation",
      );
    }
    if (e.pivot && !widget) this.node("circle", { cx: c.x, cy: c.y, r: 7, class: "pivot-marker" });
    this.pivot.style.left = `${p.x + 20}px`;
    this.pivot.style.top = `${p.y - 13}px`;
    this.pivot.disabled = e.blocked || e.isDragging;
    this.pivot.setAttribute("aria-pressed", String(e.placingPivot));
  };
  private marker(x: number, y: number, markup: string, axis: string): void {
    const size = 48 * uiScale();
    const group = this.node("g", {
      transform: `translate(${x - size / 2} ${y - size / 2})`,
      "data-move-marker": axis,
    });
    group.innerHTML = markup;
    const svg = group.firstElementChild;
    if (!svg) return;
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
  }
  dispose(): void {
    this.anchorDrag.dispose();
    this.anchor.remove();
    this.editor.world.changed.delete(this.update);
    this.svg.remove();
    this.pivot.remove();
    this.move.remove();
  }
}
