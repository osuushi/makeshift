import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pointerDragThreshold } from "../sketch/pointer-intent.js";
import { GuideDragEvents } from "./drag-events.js";
import { GuideDragFeedback } from "./drag-feedback.js";
import { near } from "./geometry.js";
import type { GuideMarker } from "./markers.js";
import { acceptGuideMove } from "./move-accept.js";
import { GuideMoveChooser } from "./move-chooser.js";
import { guideDragSource } from "./move-source.js";
import {
  type GuideMoveCandidate,
  type GuideMoveTarget,
  guideMoveProbe,
  guideMoveTargets,
} from "./move-target.js";
import type { GuideToolInput, GuideToolSession } from "./tool-path.js";
import { guideToolTargets } from "./tool-targets.js";

type Press = NonNullable<ReturnType<typeof guideDragSource>> & {
  event: PointerEvent;
};
type Drag = Press & {
  lease: InteractionLease;
  targets: GuideMoveCandidate[];
  target: GuideMoveTarget | null;
  duplicate: boolean;
  session?: GuideToolSession;
  requested?: number | null;
  validated?: number;
  released?: boolean;
};

/** A guide supplies a solvable destination to Move or the active distance tool. */
export class GuideMove {
  private events: GuideDragEvents;
  private press: Press | null = null;
  private drag: Drag | null = null;
  private running: Promise<void> | null = null;
  private presentation: GuideDragFeedback;
  private chooser: GuideMoveChooser;
  private pointer: PointerEvent | null = null;
  constructor(
    private editor: SketchEditor,
    host: HTMLElement,
    private toolInput: GuideToolInput = () => null,
  ) {
    this.presentation = new GuideDragFeedback(editor, host);
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
    this.events = new GuideDragEvents({
      move: this.move,
      release: this.release,
      cancel: () => void this.cancel(),
      active: () => !!this.press || !!this.drag,
    });
  }
  get toolActive(): boolean {
    return ["extrude", "face-offset"].includes(this.editor.interactions.current?.kind ?? "");
  }
  get dragging(): boolean {
    return !!this.drag;
  }
  canStart(item: GuideMarker): boolean {
    if (this.editor.world.active && this.editor.tool !== "select") return false;
    return !!guideDragSource(this.editor, item.anchor, item.point, this.toolInput);
  }
  get interactive(): boolean {
    const lease = this.editor.interactions.current;
    return (
      !lease || (this.toolActive && !lease.captured && lease.phase === "editing" && !this.drag)
    );
  }
  start(event: PointerEvent, item: GuideMarker): void {
    const e = this.editor;
    if (event.button || !item.guide || e.blocked || !this.interactive || this.press || this.drag)
      return;
    const source = guideDragSource(e, item.anchor, item.point, this.toolInput);
    if (source) this.press = { event, ...source };
  }
  private move = (event: PointerEvent): void => {
    const press = this.press;
    if (!this.drag && press?.event.pointerId === event.pointerId) {
      if (
        Math.hypot(event.clientX - press.event.clientX, event.clientY - press.event.clientY) <
        pointerDragThreshold(press.event)
      )
        return;
      const session = press.plan?.begin();
      const lease = press.plan
        ? session?.lease
        : this.editor.interactions.acquire("guide-move", () => this.cancel());
      this.press = null;
      if (!lease) return;
      this.drag = {
        ...press,
        lease,
        session: session ?? undefined,
        targets: press.plan
          ? guideToolTargets(this.editor, press.plan.path)
          : guideMoveTargets(this.editor, this.editor.store.data, press.origin, press.sketchPlane),
        target: null,
        duplicate: false,
      };
      lease.capture(this.editor.world.canvas, event.pointerId);
      this.events.consume();
      this.editor.refresh();
      this.presentation.destinations.show(this.drag.origin, this.drag.targets);
    }
    const drag = this.drag;
    if (
      !drag ||
      drag.released ||
      drag.event.pointerId !== event.pointerId ||
      drag.lease.phase !== "editing"
    )
      return;
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
      (drag.source?.kind === "sketches" ||
        (drag.source?.kind === "solids" && !drag.source.faces.length && !drag.source.edges.length));
    this.feedback(drag.target, event.shiftKey ? [] : potential);
    this.presentation.destinations.suppress(event.shiftKey);
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
    this.previewTool(drag, target);
    const locked = !drag.session || (target && drag.validated === target.distance);
    this.presentation.show(
      drag.origin,
      drag.targets,
      locked ? target : null,
      potential,
      this.cursor(),
    );
  }
  private previewTool(drag: Drag, target: GuideMoveTarget | null): void {
    const distance = target?.distance ?? null;
    if (!drag.session || drag.requested === distance) return;
    drag.requested = distance;
    drag.validated = undefined;
    drag.session.preview(distance);
    if (distance === null) return;
    void drag.session.settled(distance).then((valid) => {
      if (this.drag !== drag || drag.requested !== distance) return;
      if (valid) drag.validated = distance;
      else {
        drag.targets = drag.targets.filter(
          (p) => p.distance === undefined || Math.abs(p.distance - distance) > 1e-7,
        );
        drag.target = null;
        this.chooser.close();
        this.presentation.destinations.show(drag.origin, drag.targets);
        this.editor.refresh();
      }
      this.feedback(drag.target);
    });
  }
  private release = (event: PointerEvent): void => {
    if (this.press?.event.pointerId === event.pointerId) this.press = null;
    const drag = this.drag;
    if (!drag || drag.event.pointerId !== event.pointerId) return;
    this.move(event);
    this.chooser.close();
    drag.released = true;
    if (drag.session) {
      drag.lease.releaseCapture(false);
      void this.releaseTool(drag);
      return;
    }
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
  private async releaseTool(drag: Drag): Promise<void> {
    const session = drag.session;
    if (!session) return;
    const distance = drag.target?.distance;
    const valid = distance !== undefined && (await session.settled(distance));
    if (this.drag !== drag) return;
    this.drag = null;
    if (valid) drag.lease.history?.checkpoint();
    await session.release(valid);
    this.end(drag);
  }
  private async finish(drag: Drag, target: GuideMoveTarget): Promise<void> {
    if (!drag.source) return;
    try {
      await acceptGuideMove(
        this.editor,
        drag.source,
        drag.origin,
        target.point,
        drag.duplicate,
        drag.lease,
      );
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
    if (drag?.session) {
      this.drag = null;
      drag.lease.releaseCapture(false);
      this.presentation.hide();
      await drag.session.release(false);
      this.end(drag);
      return;
    }
    if (!drag?.lease.close()) return;
    this.drag = null;
    this.chooser.close();
    this.presentation.hide();
    drag.lease.show(null);
    if (this.running) await this.editor.store.cancelPreview();
    await this.running;
    this.end(drag);
  }
  private end(drag: Drag): void {
    this.drag = null;
    this.pointer = null;
    this.chooser.close();
    this.presentation.hide();
    if (!drag.session) drag.lease.release();
    this.editor.refresh();
  }
  dispose(): void {
    void this.cancel();
    this.events.dispose();
    this.presentation.dispose();
    this.chooser.dispose();
  }
}
