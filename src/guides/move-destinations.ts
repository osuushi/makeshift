import type { SketchEditor } from "../sketch/editor.js";
import type { Vector } from "../sketch/planes.js";
import { near } from "./geometry.js";
import type { GuideMoveCandidate } from "./move-target.js";
import { guidePlanePatches } from "./plane-patches.js";

const ns = "http://www.w3.org/2000/svg";
/** Transient destination markers never intercept the drag's captured pointer. */
export class GuideMoveDestinations {
  private root = document.createElementNS(ns, "svg");
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
  ) {
    this.root.classList.add("guide-move-destinations");
    this.root.setAttribute("aria-hidden", "true");
    host.append(this.root);
    this.hide();
  }
  show(origin: Vector, candidates: GuideMoveCandidate[]): void {
    this.root.replaceChildren(guidePlanePatches(this.editor, candidates));
    this.root.style.display = "block";
    this.suppress(false);
    const start = this.editor.world.project(origin);
    const unique = candidates.filter(
      (p, i) => candidates.findIndex((q) => near(p.point, q.point)) === i,
    );
    for (const candidate of unique) {
      const group = candidates.filter((p) => near(p.point, candidate.point));
      const projection = group.some((p) => p.plane);
      const visible = group.some((p) => p.visible);
      const point = this.editor.world.project(candidate.point);
      if (projection) {
        const line = document.createElementNS(ns, "line");
        line.dataset.point = JSON.stringify(candidate.point);
        for (const [key, value] of Object.entries({
          x1: start.x,
          y1: start.y,
          x2: point.x,
          y2: point.y,
        }))
          line.setAttribute(key, String(value));
        this.root.append(line);
      }
      if (group.some((p) => p.guide)) continue;
      const circle = document.createElementNS(ns, "circle");
      circle.dataset.point = JSON.stringify(candidate.point);
      circle.dataset.projection = String(projection);
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", "4");
      circle.classList.toggle("covered", !visible);
      this.root.append(circle);
    }
  }
  suppress(suppressed: boolean): void {
    this.root.classList.toggle("suppressed", suppressed);
  }
  hide(): void {
    this.root.style.display = "none";
    this.root.replaceChildren();
  }
  dispose(): void {
    this.root.remove();
  }
}
