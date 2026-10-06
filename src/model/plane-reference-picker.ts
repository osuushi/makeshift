import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, planes } from "../sketch/planes.js";
import { PlaneCutHover } from "./plane-cut-hover.js";
import { type PlaneReferenceSource, pickPlaneInterior } from "./plane-interior-pick.js";

/** A tool consumes an evaluated frame; picking never creates a dependency. */
export class PlaneReferencePicker {
  private abort = new AbortController();
  private hover: PlaneCutHover;
  accepts: ((frame: PlaneFrame) => boolean) | undefined;
  private leave: (() => void) | undefined;
  private hoverEnabled: ((event: PointerEvent) => boolean) | undefined;
  reference: PlaneReferenceSource | null = null;
  choose: ((frame: PlaneFrame, source?: PlaneReferenceSource) => void) | null = null;
  constructor(private editor: SketchEditor) {
    this.hover = new PlaneCutHover(editor, (event) =>
      this.hoverEnabled && !this.hoverEnabled(event) ? undefined : this.accepts,
    );
    const options = { signal: this.abort.signal, capture: true };
    editor.world.canvas.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.choose || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      options,
    );
    editor.world.canvas.addEventListener(
      "click",
      (event) => {
        if (!this.choose || !this.accepts || event.button || event.metaKey || event.ctrlKey) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (editor.blocked) return;
        const hit = pickPlaneInterior(editor, { x: event.clientX, y: event.clientY }, this.accepts);
        if (hit) this.choose(structuredClone(hit.frame), hit.source);
        else this.leave?.();
      },
      options,
    );
  }
  start(
    choose: (frame: PlaneFrame) => void,
    accepts?: (frame: PlaneFrame) => boolean,
    leave?: () => void,
    hoverEnabled?: (event: PointerEvent) => boolean,
  ): void {
    this.accepts = accepts ?? (() => true);
    this.leave = leave;
    this.hoverEnabled = hoverEnabled;
    this.editor.world.planePickerAccept = this.accepts;
    this.reference = null;
    this.choose = (frame, source) => {
      if (this.accepts && !this.accepts(frame)) return;
      this.hover.clear();
      this.reference = source ?? null;
      choose(frame);
      this.editor.interactions.current?.history?.checkpoint();
    };
    this.editor.world.planePickerLabel = "Use plane";
    this.editor.world.planePicker = (id) =>
      this.choose?.(structuredClone(planes[id]), { kind: "world-plane", id });
  }
  stop(): void {
    this.choose = null;
    this.reference = null;
    this.accepts = undefined;
    this.leave = undefined;
    this.hoverEnabled = undefined;
    this.editor.world.planePickerAccept = null;
    this.editor.world.planePicker = null;
    this.editor.world.planePickerLabel = "Project onto";
    this.hover.clear();
  }
  dispose(): void {
    this.stop();
    this.abort.abort();
    this.hover.dispose();
  }
}
