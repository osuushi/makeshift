import type { ScaleSource } from "../model/scale.js";
import { boxMoveRequest, previewBoxMove } from "../model/transform-box-preview.js";
import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { type PlaneFrame, type Vector, worldPoint } from "../sketch/planes.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { near } from "./geometry.js";
import { GuideHighlight } from "./highlight.js";
import type { GuideMarker } from "./markers.js";
import { GuideMoveChooser } from "./move-chooser.js";
import { GuideMoveDestinations } from "./move-destinations.js";
import { guideMoveSource } from "./move-source.js";
import {
  type GuideMoveCandidate,
  type GuideMoveTarget,
  guideMoveProbe,
  guideMoveTargets,
} from "./move-target.js";
import { GuideMoveView } from "./move-view.js";

type Press = { event: PointerEvent; source: ScaleSource; origin: Vector; sketchPlane?: PlaneFrame };
type Drag = Press & {
  lease: InteractionLease;
  targets: GuideMoveCandidate[];
  target: GuideMoveTarget | null;
  duplicate: boolean;
};

/** A saved guide defines a displacement, applied once only after acquiring a snap. */
export class GuideMove {
  private abort = new AbortController();
  private press: Press | null = null;
  private drag: Drag | null = null;
  private running: Promise<void> | null = null;
  private consumeClick = false;
  private view: GuideMoveView;
  private chooser: GuideMoveChooser;
  private destinations: GuideMoveDestinations;
  private highlight: GuideHighlight;
  private pointer: PointerEvent | null = null;
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
  ) {
    this.view = new GuideMoveView(editor, host);
    this.destinations = new GuideMoveDestinations(editor, host);
    this.highlight = new GuideHighlight(editor);
    this.chooser = new GuideMoveChooser(
      editor,
      (target) => {
        if (!this.drag) return;
        this.drag.target = target;
        this.feedback(target);
      },
      () => {
        if (this.pointer) this.move(this.pointer);
      },
    );
    const options = { capture: true, signal: this.abort.signal };
    window.addEventListener("pointermove", this.move, options);
    window.addEventListener("pointerup", this.release, options);
    window.addEventListener("pointercancel", () => void this.cancel(), options);
    window.addEventListener("blur", () => void this.cancel(), { signal: this.abort.signal });
    window.addEventListener(
      "pointerdown",
      () => {
        this.consumeClick = false;
      },
      options,
    );
    window.addEventListener(
      "click",
      (event) => {
        if (!this.consumeClick) return;
        this.consumeClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    onModelKeydown((event) => {
      if (event.key === "Escape" && (this.press || this.drag)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void this.cancel();
      }
    }, options);
  }
  start(event: PointerEvent, item: GuideMarker): void {
    const e = this.editor;
    if (
      event.button ||
      !item.guide ||
      e.blocked ||
      e.interactions.current ||
      this.press ||
      this.drag
    )
      return;
    const source = guideMoveSource(e, item.anchor);
    if (!source) return;
    const sketchPlane = source.kind === "curves" ? e.sketch?.plane : undefined;
    let origin = item.point;
    if (sketchPlane) {
      const screen = e.world.project(origin),
        local = e.world.pointAt(sketchPlane, screen.x, screen.y);
      if (!local) return;
      origin = worldPoint(sketchPlane, local);
    }
    this.press = { event, source, origin, sketchPlane };
  }
  private move = (event: PointerEvent): void => {
    const press = this.press;
    if (!this.drag && press?.event.pointerId === event.pointerId) {
      if (
        Math.hypot(event.clientX - press.event.clientX, event.clientY - press.event.clientY) <
        pointerDragThreshold(press.event)
      )
        return;
      const lease = this.editor.interactions.acquire("guide-move", () => this.cancel());
      this.press = null;
      if (!lease) return;
      this.drag = {
        ...press,
        lease,
        targets: guideMoveTargets(
          this.editor,
          this.editor.store.data,
          press.origin,
          press.sketchPlane,
        ),
        target: null,
        duplicate: false,
      };
      lease.capture(this.editor.world.canvas, event.pointerId);
      this.consumeClick = true;
      this.editor.refresh();
      this.destinations.show(this.drag.origin, this.drag.targets);
    }
    const drag = this.drag;
    if (!drag || drag.event.pointerId !== event.pointerId || drag.lease.phase !== "editing") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pointer = event;
    let potential: GuideMoveTarget[] = [];
    if (this.chooser.opened) drag.target = event.shiftKey ? null : this.chooser.drag(event);
    else {
      const probe = event.shiftKey
        ? { target: null, choices: [] }
        : guideMoveProbe(this.editor, drag.targets, { x: event.clientX, y: event.clientY });
      const previous = drag.target;
      drag.target =
        probe.target ??
        probe.choices.find((p) => previous && near(p.point, previous.point)) ??
        null;
      this.chooser.track(event, probe.choices, drag.target);
      potential = probe.choices;
    }
    drag.duplicate =
      event.altKey &&
      (drag.source.kind === "sketches" ||
        (drag.source.kind === "solids" && !drag.source.faces.length && !drag.source.edges.length));
    this.feedback(drag.target, event.shiftKey ? [] : potential);
    this.destinations.suppress(event.shiftKey);
  };
  private cursor() {
    return this.pointer ? { x: this.pointer.clientX, y: this.pointer.clientY } : undefined;
  }
  private feedback(
    target: GuideMoveTarget | null,
    potential: readonly GuideMoveTarget[] = [],
  ): void {
    const drag = this.drag;
    if (!drag) return;
    const points = target ? [target] : potential;
    const parents = drag.targets.filter((p) => points.some((q) => near(p.point, q.point)));
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
    this.destinations.highlight(parents);
    this.view.show(drag.origin, target, this.cursor());
    this.editor.world.requestDraw();
  }
  private release = (event: PointerEvent): void => {
    if (this.press?.event.pointerId === event.pointerId) this.press = null;
    const drag = this.drag;
    if (!drag || drag.event.pointerId !== event.pointerId) return;
    this.move(event);
    this.chooser.close();
    drag.lease.releaseCapture();
    if (!drag.target || drag.target.point.every((v, i) => Math.abs(v - drag.origin[i]) < 1e-8)) {
      void this.cancel();
      return;
    }
    if (drag.lease.wait()) {
      this.running = this.finish(drag, drag.target);
      this.editor.refresh();
    }
  };
  private async finish(drag: Drag, target: GuideMoveTarget): Promise<void> {
    const delta = target.point.map((v, i) => v - drag.origin[i]) as Vector;
    const request = boxMoveRequest(
      this.editor.store.data,
      drag.source,
      drag.origin,
      delta,
      drag.duplicate,
    );
    try {
      if (!request) return;
      if (request.kind === "accept") {
        const valid = await previewBoxMove(
          this.editor,
          drag.source,
          drag.origin,
          delta,
          drag.lease,
        );
        if (!valid || drag.lease.phase !== "waiting") return;
      }
      if (!drag.lease.close()) return;
      if (request.kind === "accept") await this.editor.accept();
      else await this.editor.store.request(request);
    } finally {
      if (drag.lease.phase === "waiting") {
        drag.lease.close();
        await this.editor.store.cancelPreview();
      }
      if (this.drag === drag) this.end(drag);
      this.running = null;
    }
  }
  private async cancel(): Promise<void> {
    this.press = null;
    const drag = this.drag;
    if (!drag?.lease.close()) return;
    this.drag = null;
    this.chooser.close();
    this.view.hide();
    this.destinations.hide();
    this.highlight.show(null);
    drag.lease.show(null);
    if (this.running) await this.editor.store.cancelPreview();
    await this.running;
    this.end(drag);
  }
  private end(drag: Drag): void {
    this.drag = null;
    this.pointer = null;
    this.chooser.close();
    this.view.hide();
    this.destinations.hide();
    this.highlight.show(null);
    drag.lease.release();
    this.editor.refresh();
  }
  dispose(): void {
    void this.cancel();
    this.abort.abort();
    this.view.dispose();
    this.destinations.dispose();
    this.highlight.dispose();
    this.chooser.dispose();
  }
}
