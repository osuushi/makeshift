import type { SketchEditor } from "../sketch/editor.js";
import { minimumPlaneBounds, type PlaneBounds, planeCorners } from "../sketch/plane-bounds.js";
import { type PlaneFrame, planes, type Vector } from "../sketch/planes.js";
import { featureEdges } from "./feature-edges.js";

export interface PlaneCandidate {
  frame?: PlaneFrame;
  surface?: { body: string; face: string };
  outline: Vector[][];
}
export const planeKey = (frame: PlaneFrame): string => JSON.stringify(frame);
export function planeOutline(
  frame: PlaneFrame,
  bounds: PlaneBounds = minimumPlaneBounds(),
): Vector[][] {
  const corners = planeCorners(frame, bounds);
  return [[...corners, corners[0]]];
}
export function planeCandidates(editor: SketchEditor): PlaneCandidate[] {
  const result: PlaneCandidate[] = Object.values(planes).map((frame) => ({
    frame,
    outline: planeOutline(frame, editor.world.planeBounds(frame)),
  }));
  for (const plane of editor.store.data.constructionPlanes ?? [])
    if (editor.visibility.visible(plane.id))
      result.push({
        frame: plane.frame,
        outline: planeOutline(plane.frame, editor.world.planeBounds(plane.frame)),
      });
  if (editor.bodiesVisible)
    for (const body of editor.store.data.bodies ?? []) {
      if (!editor.visibility.visible(body.id)) continue;
      const edges = featureEdges(body);
      for (const face of body.faces) {
        const outline = edges
          .filter((edge) => face.edges.includes(edge.id))
          .map((edge) => {
            const points: Vector[] = [];
            for (let i = 0; i < edge.points.length; i += 3)
              points.push(edge.points.slice(i, i + 3) as Vector);
            return points;
          });
        result.push({
          frame: face.plane ?? undefined,
          ...(face.plane ? {} : { surface: { body: body.id, face: face.id } }),
          outline,
        });
      }
    }
  return result;
}

/** Quiet outlines of available references; no filled overlay and no hit interception. */
export class PlaneCandidateView {
  private svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private candidates: PlaneCandidate[] = [];
  constructor(
    private editor: SketchEditor,
    overlay: HTMLElement,
  ) {
    this.svg.classList.add("plane-candidate-outlines");
    Object.assign(this.svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
    });
    overlay.append(this.svg);
    editor.world.changed.add(this.update);
  }
  show(candidates: PlaneCandidate[]): void {
    this.candidates = candidates;
    this.update();
  }
  private update = (): void => {
    this.svg.replaceChildren();
    for (const candidate of this.candidates)
      for (const points of candidate.outline) {
        const path = document.createElementNS(this.svg.namespaceURI, "polyline");
        path.setAttribute(
          "points",
          points
            .map((p) => {
              const s = this.editor.world.project(p);
              return `${s.x},${s.y}`;
            })
            .join(" "),
        );
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "#4786b5");
        path.setAttribute("stroke-opacity", "0.55");
        path.setAttribute("stroke-width", "1.5");
        this.svg.append(path);
      }
  };
  dispose(): void {
    this.editor.world.changed.delete(this.update);
    this.svg.remove();
  }
}
