import type { SketchEditor } from "../sketch/editor.js";
import type { PlaneId, Vector } from "../sketch/planes.js";
import { guideCylinderPatches } from "./cylinder-patches.js";
import { near } from "./geometry.js";
import type { GuideMoveCandidate } from "./move-target.js";
import { guideFacePlanePatches, guidePlanePatches } from "./plane-patches.js";
import { guideVisibleThroughSolids } from "./solid-visibility.js";
import { GuideWidgetClearance, guideOverlapsWidget } from "./widget-clearance.js";

const ns = "http://www.w3.org/2000/svg";
/** Transient destination markers never intercept the drag's captured pointer. */
export class GuideMoveDestinations {
  private root = document.createElementNS(ns, "svg");
  private facePatches: SVGGElement | null = null;
  private lockedKey = "";
  private clearance: GuideWidgetClearance;
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    private connections = true,
  ) {
    this.root.classList.add("guide-move-destinations");
    this.root.setAttribute("aria-hidden", "true");
    host.append(this.root);
    this.clearance = new GuideWidgetClearance(host, () => this.hideOverlaps());
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
      const projection = group.some((p) => p.plane || p.alignment);
      const visible = group.some((p) => p.visible);
      const point = this.editor.world.project(candidate.point);
      if (projection && this.connections) {
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
    this.hideOverlaps();
    this.clearance.schedule();
  }
  pending(origin: Vector): void {
    this.show(origin, []);
    const point = this.editor.world.project(origin);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(point.x + 16));
    label.setAttribute("y", String(point.y - 20));
    label.textContent = "Finding targets…";
    this.root.append(label);
  }
  suppress(suppressed: boolean): void {
    this.root.classList.toggle("suppressed", suppressed);
  }
  highlight(parents: readonly GuideMoveCandidate[], locked: boolean): void {
    this.root.querySelector(".guide-destination-lock")?.remove();
    const target = locked ? parents[0] : undefined;
    if (target) {
      const point = this.editor.world.project(target.point);
      const circle = document.createElementNS(ns, "circle");
      circle.classList.add("guide-destination-lock");
      circle.dataset.point = JSON.stringify(target.point);
      circle.dataset.distance = String(target.distance ?? "");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", target.guide ? "13" : "7");
      this.root.append(circle);
    }
    this.hideOverlaps();
    this.clearance.schedule();
    const planes = new Set(
      parents.flatMap((p) =>
        p.plane && p.reference.kind === "plane" && p.reference.world ? [p.reference.world] : [],
      ),
    );
    for (const patch of this.root.querySelectorAll<SVGGElement>(".guide-plane-patch[data-plane]"))
      patch.classList.toggle("highlighted", planes.has(patch.dataset.plane as PlaneId));
    const faces = locked
      ? parents.filter((p) => p.alignment || (p.plane && p.reference.kind === "face"))
      : [];
    const key = JSON.stringify(faces.map((p) => [p.reference, p.point, p.alignment]));
    if (key === this.lockedKey) return;
    this.lockedKey = key;
    this.facePatches?.remove();
    this.facePatches = guideFacePlanePatches(this.editor, faces);
    this.facePatches.append(guideCylinderPatches(this.editor, faces));
    this.root.prepend(this.facePatches);
  }
  private hideOverlaps(): void {
    const bounds = this.clearance.bounds();
    for (const circle of this.root.querySelectorAll("circle")) {
      const point = {
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
      };
      const radius = Number(circle.getAttribute("r"));
      const worldPoint = JSON.parse(circle.getAttribute("data-point") ?? "null") as Vector | null;
      circle.style.display =
        guideOverlapsWidget(point, bounds, radius) ||
        (worldPoint && !guideVisibleThroughSolids(this.editor, worldPoint))
          ? "none"
          : "";
    }
  }
  hide(): void {
    this.root.style.display = "none";
    this.root.replaceChildren();
    this.facePatches = null;
    this.lockedKey = "";
  }
  dispose(): void {
    this.clearance.dispose();
    this.root.remove();
  }
}
