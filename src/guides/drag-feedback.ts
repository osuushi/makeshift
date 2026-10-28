import type { SketchEditor } from "../sketch/editor.js";
import type { Point, Vector } from "../sketch/planes.js";
import { near } from "./geometry.js";
import { GuideHighlight } from "./highlight.js";
import { GuideMoveDestinations } from "./move-destinations.js";
import type { GuideMoveCandidate, GuideMoveTarget } from "./move-target.js";
import { GuideMoveView } from "./move-view.js";

/** One presentation for rigid movement and tool-constrained guide gestures. */
export class GuideDragFeedback {
  private view: GuideMoveView | null;
  readonly destinations: GuideMoveDestinations;
  private highlight: GuideHighlight;
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    vector = true,
  ) {
    this.view = vector ? new GuideMoveView(editor, host) : null;
    this.destinations = new GuideMoveDestinations(editor, host, vector);
    this.highlight = new GuideHighlight(editor);
  }
  show(
    origin: Vector,
    targets: GuideMoveCandidate[],
    target: GuideMoveTarget | null,
    potential: readonly GuideMoveTarget[],
    cursor?: Point,
  ): void {
    if (cursor) this.destinations.move(cursor);
    const points = target ? [target] : potential;
    const parents = targets.filter((p) => points.some((q) => near(p.point, q.point)));
    const anchors = parents.flatMap((p) =>
      p.anchor
        ? [p.anchor]
        : p.reference.kind === "face"
          ? [
              {
                kind: "body-faces" as const,
                body: p.reference.body,
                faces: [p.reference.face],
                feature: "area-center" as const,
              },
            ]
          : [],
    );
    const references = parents.flatMap((p) =>
      p.plane && p.reference.kind === "plane" && !p.reference.world ? [p.reference] : [],
    );
    this.highlight.show(anchors, references);
    const alignment = target?.alignment;
    const emphasis = alignment
      ? parents.filter((p) => p.alignment && near(p.alignment.point, alignment.point)).slice(0, 1)
      : parents;
    this.destinations.highlight(emphasis, !!target);
    this.view?.show(origin, target, cursor);
    this.editor.world.requestDraw();
  }
  hide(): void {
    this.view?.hide();
    this.destinations.hide();
    this.highlight.show(null);
  }
  dispose(): void {
    this.view?.dispose();
    this.destinations.dispose();
    this.highlight.dispose();
  }
}
