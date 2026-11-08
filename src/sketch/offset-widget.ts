import { directionalOffset, directionalWidget } from "../model/directional-widget.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { offsetFrame } from "./offset-geometry.js";
import { offsetHandleFrame } from "./offset-handle-frame.js";
import type { OffsetTarget } from "./offset-target.js";
import type { Point, Vector } from "./planes.js";
import { scale } from "./point-math.js";

export class OffsetWidget {
  private observer: MutationObserver;
  private placement: { sketch: Sketch; target: OffsetTarget; normal?: Point } | null = null;

  constructor(
    private editor: SketchEditor,
    private root: HTMLElement,
    private handle: HTMLButtonElement,
  ) {
    // Both collision layout and the movable panel grip can displace the handle.
    this.observer = new MutationObserver(() => this.orient());
    this.observer.observe(root, { attributes: true, attributeFilter: ["style"] });
  }

  normal(sketch: Sketch, target: OffsetTarget): Point {
    const rect = this.handle.getBoundingClientRect();
    const position = this.editor.world.pointAt(
      sketch.plane,
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
    );
    return position
      ? offsetHandleFrame(target, position).normal
      : scale(offsetFrame(target.curve).normal, target.direction);
  }

  place(sketch: Sketch, target: OffsetTarget, normal?: Point): void {
    this.placement = { sketch, target, normal };
    const base = offsetFrame(target.curve);
    const axis = scale(base.normal, target.direction);
    const { direction, width } = this.axes(sketch, axis);
    const offset = directionalOffset(this.editor.world.camera, direction, 48, width);
    const p = this.editor.world.projectLocal(sketch.plane, base.point);
    const bounds = this.editor.world.canvas.getBoundingClientRect();
    this.root.style.left = `${p.x - bounds.left + offset.x}px`;
    this.root.style.top = `${p.y - bounds.top + offset.y}px`;
    this.orient();
  }

  private axes(sketch: Sketch, normal: Point) {
    return {
      direction: sketch.plane.u.map(
        (v, i) => v * normal.x + sketch.plane.v[i] * normal.y,
      ) as Vector,
      width: sketch.plane.u.map((v, i) => -v * normal.y + sketch.plane.v[i] * normal.x) as Vector,
    };
  }

  private orient(): void {
    if (!this.placement || this.root.hidden) return;
    const { sketch, target, normal } = this.placement;
    const { direction, width } = this.axes(sketch, normal ?? this.normal(sketch, target));
    this.handle.innerHTML = directionalWidget(this.editor.world.camera, direction, "offset", width);
  }

  dispose(): void {
    this.observer.disconnect();
  }
}
