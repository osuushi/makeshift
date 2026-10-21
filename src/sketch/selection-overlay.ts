import { overlapPreviews } from "../model/overlap-preview.js";
import { bowGuides, selectedBowCurves } from "./arc-edit.js";
import { arcAt, arcCircle } from "./arc-geometry.js";
import { bowDirections } from "./bow-direction.js";
import { circlePoint, displayPoints } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import { sketchOverlapChoices } from "./overlap-targets.js";
import type { Point } from "./planes.js";
import { pointLinked } from "./point-links.js";
import { midpoint } from "./point-math.js";
import { pointKey, rectangleHandles } from "./point-query.js";
import { pointSelected } from "./point-selection.js";
import { rectangleFrame } from "./rectangle-edit.js";
import { selectHit } from "./selection-input.js";

export class SelectionOverlay {
  private readonly svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private readonly chooser = document.createElement("div");
  private readonly feedback = document.createElement("div");
  private rect: DOMRect;
  private markers = new Set<string>();
  private previousChoices: SketchEditor["overlaps"] = null;
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.rect = editor.world.canvas.getBoundingClientRect();
    this.svg.classList.add("handles");
    this.svg.setAttribute("aria-hidden", "true");
    this.chooser.className = "overlap-chooser";
    this.feedback.className = "local-feedback";
    this.feedback.setAttribute("role", "alert");
    overlay.append(this.svg, this.chooser, this.feedback);
    editor.world.changed.add(this.update);
    this.update();
  }
  private node(tag: string, attributes: Record<string, string | number>): Element {
    const node = document.createElementNS(this.svg.namespaceURI, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    this.svg.append(node);
    return node;
  }
  private circle(point: Point, r: number, className: string): void {
    const key = `${point.x.toFixed(4)}/${point.y.toFixed(4)}/${r}/${className}`;
    if (this.markers.has(key)) return;
    this.markers.add(key);
    this.node("circle", {
      cx: point.x - this.rect.left,
      cy: point.y - this.rect.top,
      r,
      class: className,
    });
  }
  private line(a: Point, b: Point, className: string): void {
    this.node("line", {
      x1: a.x - this.rect.left,
      y1: a.y - this.rect.top,
      x2: b.x - this.rect.left,
      y2: b.y - this.rect.top,
      class: className,
    });
  }
  private drawHandles(): void {
    const { editor } = this,
      sketch = editor.sketch,
      group = editor.rectangleContext;
    if (!sketch) return;
    const selected = editor.selectionOwners;
    if (group) {
      for (const { point, handle } of rectangleHandles(sketch, group))
        this.circle(
          editor.world.projectLocal(sketch.plane, point),
          handle.kind === "corner" ? 4.5 : 3.5,
          pointSelected(editor, `${group.id}/${handle.kind}/${handle.index}`)
            ? "selected-point"
            : "edit-handle",
        );
      this.circle(
        editor.world.projectLocal(sketch.plane, rectangleFrame(sketch, group).center),
        5,
        pointSelected(editor, `${group.id}/center`) ? "selected-point" : "center-handle",
      );
    }
    for (const curve of sketch.curves) {
      if (!selected.has(curve.id) || sketch.groups.some((item) => item.members.includes(curve.id)))
        continue;
      if (curve.kind === "circle") {
        const center = editor.world.projectLocal(sketch.plane, curve.center);
        this.circle(
          center,
          5,
          pointSelected(editor, `${curve.id}/center`)
            ? "selected-point"
            : pointLinked(sketch, { curve: curve.id, end: "center" })
              ? "constrained-point"
              : "center-handle",
        );
        if (editor.circle) {
          const rim = editor.world.projectLocal(
            sketch.plane,
            circlePoint(curve, editor.circleAngle),
          );
          this.line(center, rim, "rotation-guide");
          this.circle(rim, 4.5, "edit-handle");
        }
        continue;
      }
      if (curve.kind === "arc")
        this.circle(
          editor.world.projectLocal(sketch.plane, arcCircle(curve).center),
          5,
          pointSelected(editor, `${curve.id}/center`)
            ? "selected-point"
            : pointLinked(sketch, { curve: curve.id, end: "center" })
              ? "constrained-point"
              : "center-handle",
        );
      for (const end of ["a", "b"] as const)
        this.circle(
          editor.world.projectLocal(sketch.plane, curve[end]),
          4.5,
          pointSelected(editor, `${curve.id}/${end}`)
            ? "selected-point"
            : pointLinked(sketch, { curve: curve.id, end })
              ? "constrained-point"
              : "edit-handle",
        );
      if (pointSelected(editor, `${curve.id}/midpoint`))
        this.circle(
          editor.world.projectLocal(
            sketch.plane,
            curve.kind === "arc" ? arcAt(curve, 0.5) : midpoint(curve.a, curve.b),
          ),
          5,
          "selected-point",
        );
    }
  }
  private drawHints(): void {
    const { editor } = this,
      sketch = editor.sketch;
    if (sketch && editor.hover && pointKey(editor.hover))
      this.circle(editor.world.projectLocal(sketch.plane, editor.hover.point), 7, "hover-point");
    if (sketch && editor.snap)
      this.circle(editor.world.projectLocal(sketch.plane, editor.snap), 7, "snap-cue");
    if (editor.selectionBox) {
      const { a, b } = editor.selectionBox;
      this.node("rect", {
        x: Math.min(a.x, b.x) - this.rect.left,
        y: Math.min(a.y, b.y) - this.rect.top,
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y),
        class: "selection-box",
      });
    }
  }
  private showChoices(): void {
    const { editor } = this;
    this.chooser.hidden = !editor.overlaps;
    if (this.previousChoices === editor.overlaps) return;
    this.previousChoices = editor.overlaps;
    this.chooser.replaceChildren();
    if (!editor.overlaps) return;
    this.chooser.style.left = `${editor.overlaps.screen.x - this.rect.left + 14}px`;
    this.chooser.style.top = `${editor.overlaps.screen.y - this.rect.top + 14}px`;
    const choices = sketchOverlapChoices(editor, editor.overlaps.hits);
    const previews = overlapPreviews(editor, choices);
    for (const [index, hit] of editor.overlaps.hits.entries()) {
      const button = document.createElement("button");
      button.setAttribute("aria-label", choices[index].label);
      button.append(previews[index]);
      const label = document.createElement("span");
      label.textContent = choices[index].label;
      button.append(label);
      button.addEventListener("pointerenter", () => {
        editor.hover = hit;
        editor.refresh();
      });
      button.addEventListener("focus", () => {
        editor.hover = hit;
        editor.refresh();
      });
      button.addEventListener("click", (event) => {
        selectHit(editor, hit, event);
        editor.overlaps = null;
        editor.refresh();
      });
      this.chooser.append(button);
    }
    const bounds = this.chooser.getBoundingClientRect();
    this.chooser.style.left = `${Math.max(8, Math.min(editor.overlaps.screen.x - this.rect.left + 14, this.rect.width - bounds.width - 8))}px`;
    this.chooser.style.top = `${Math.max(8, Math.min(editor.overlaps.screen.y - this.rect.top + 14, this.rect.height - bounds.height - 8))}px`;
  }
  private update = (): void => {
    this.rect = this.editor.world.canvas.getBoundingClientRect();
    this.svg.replaceChildren();
    this.markers.clear();
    this.svg.setAttribute("viewBox", `0 0 ${this.rect.width} ${this.rect.height}`);
    this.drawHandles();
    const sketch = this.editor.sketch;
    const hover = this.editor.hover;
    const directions =
      sketch && hover?.kind === "bow"
        ? bowDirections(sketch, selectedBowCurves(this.editor))
        : null;
    if (sketch)
      for (const guide of bowGuides(this.editor)) {
        const highlighted =
          hover?.kind === "bow" &&
          directions &&
          guide.side * (directions.get(guide.curve) ?? 1) ===
            hover.side * (directions.get(hover.curve) ?? 1);
        const emphasis = highlighted ? " bow-match" : "";
        if (sketch.curves.some((c) => c.id === guide.curve && c.kind === "segment")) {
          const points = displayPoints(
            guide.shape,
            this.editor.world.height / this.rect.height,
          ).map((p) => this.editor.world.projectLocal(sketch.plane, p));
          this.node("polyline", {
            points: points.map((p) => `${p.x - this.rect.left},${p.y - this.rect.top}`).join(" "),
            class: `bow-guide${emphasis}`,
          });
        }
        this.circle(
          this.editor.world.projectLocal(sketch.plane, guide.point),
          4,
          `bow-handle${emphasis}`,
        );
      }
    this.drawHints();
    this.showChoices();
    // Erode displays failure feedback beside its allowance retry action.
    this.feedback.hidden =
      !this.editor.message || this.editor.interactions.current?.kind === "erode";
    this.feedback.textContent = this.editor.message;
    const projection = this.editor.interactions.current?.kind === "projection";
    this.feedback.classList.toggle("projection-feedback", projection);
    const point = this.editor.pointer ?? { x: this.rect.width / 2, y: this.rect.height / 2 };
    this.feedback.style.left = projection
      ? ""
      : `${Math.max(10, Math.min(this.rect.width - 260, point.x - this.rect.left + 16))}px`;
    this.feedback.style.top = projection
      ? ""
      : `${Math.max(60, Math.min(this.rect.height - 55, point.y - this.rect.top + 26))}px`;
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.svg.remove();
    this.chooser.remove();
    this.feedback.remove();
  }
}
