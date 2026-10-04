import * as THREE from "three";
import { BodyPivotDrag } from "../model/body-pivot-drag.js";
import { WidgetClearance } from "../model/widget-clearance.js";
import { cameraFacingWidth } from "../model/widget-frame.js";
import { uiScale } from "../preferences/ui-scale.js";
import type { SketchEditor } from "./editor.js";
import { markerMarkup } from "./move-widget/geometry.js";
import { type Point, worldPoint } from "./planes.js";
import { selectionFrame } from "./selection-frame.js";
import { sketchIcon } from "./sketch-icons.js";
import {
  registerSketchWidgets,
  sketchWidgetTarget,
  updateSketchWidgets,
} from "./sketch-widget-layout.js";
import { sketchRotationVisible, transformHandles } from "./transform-handles.js";

export class TransformOverlay {
  private root = document.createElement("div");
  private placement = new WidgetClearance(this.root);
  private unregister: () => void;
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private move = document.createElement("button");
  private pivot = document.createElement("button");
  private anchor = document.createElement("button");
  private anchorDrag: BodyPivotDrag;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.root.style.cssText = "position:absolute;inset:0;pointer-events:none";
    this.unregister = registerSketchWidgets(editor, this.root, this.redraw);
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
    this.root.append(this.svg, this.pivot, this.move, this.anchor);
    overlay.append(this.root);
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
    if (sketch && frame) {
      const c = e.world.projectLocal(sketch.plane, frame.pivot),
        p = e.world.projectLocal(sketch.plane, frame.handle);
      this.anchor.style.left = `${c.x - r.left}px`;
      this.anchor.style.top = `${c.y - r.top}px`;
      this.pivot.style.left = `${p.x - r.left + 20}px`;
      this.pivot.style.top = `${p.y - r.top - 13}px`;
    }
    this.placement.fit([this.move, this.pivot, this.anchor]);
    this.pivot.disabled = e.blocked || e.isDragging;
    this.pivot.setAttribute("aria-pressed", String(e.placingPivot));
    this.redraw();
  };

  // Scale's later layout callback repaints glyphs against the final HTML controls.
  // It must not reset anchors that Dimensions already moved clear of curve geometry.
  private redraw = (): void => {
    const e = this.editor,
      sketch = e.sketch,
      frame = selectionFrame(e),
      r = e.world.canvas.getBoundingClientRect();
    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
    if (!sketch || !frame || (e.circle && !e.moveMode) || e.pointMenu) {
      updateSketchWidgets(e, []);
      return;
    }
    const project = (p: Point) => {
      const s = e.world.projectLocal(sketch.plane, p);
      return { x: s.x - r.left, y: s.y - r.top };
    };
    const c = project(frame.pivot),
      p = project(frame.handle),
      widget = transformHandles(e);
    const entries: { key: string; point: Point }[] = widget
      ? widget.axes.map((handle) => ({ key: handle.axis, point: handle.point }))
      : [];
    if (widget?.rotationVisible || (!widget && sketchRotationVisible(e)))
      entries.push({ key: "rotation", point: widget?.rotation ?? frame.handle });
    if (widget) {
      e.transformAnchor = { point: worldPoint(sketch.plane, frame.pivot), active: e.moveMode };
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
    this.layout(entries);
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
  private layout(entries: { key: string; point: Point }[]): void {
    updateSketchWidgets(this.editor, entries);
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    for (const group of this.svg.querySelectorAll<SVGGElement>("[data-move-marker]")) {
      const target = sketchWidgetTarget(this.editor, group.dataset.moveMarker ?? "");
      if (!target) continue;
      const x = target.screen.x - bounds.left,
        y = target.screen.y - bounds.top;
      group.setAttribute(
        "transform",
        `translate(${x - target.width / 2} ${y - target.height / 2})`,
      );
      group.dataset.widgetFit = target.limited ? "limited" : "clear";
      group.dataset.displayOffsetX = String(target.offset.x);
      group.dataset.displayOffsetY = String(target.offset.y);
      if (Math.hypot(target.offset.x, target.offset.y) > 12)
        this.node("line", {
          x1: x - target.offset.x,
          y1: y - target.offset.y,
          x2: x,
          y2: y,
          class: "rotation-guide",
          "stroke-dasharray": "3 4",
        });
    }
  }

  dispose(): void {
    this.unregister();
    this.placement.dispose();
    this.anchorDrag.dispose();
    this.anchor.remove();
    this.editor.world.changed.delete(this.update);
    this.svg.remove();
    this.pivot.remove();
    this.move.remove();
    this.root.remove();
  }
}
