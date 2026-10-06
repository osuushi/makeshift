import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, planes } from "../sketch/planes.js";
import { type CutFacePicker, pickCutReference } from "./cut-face-reference.js";
import { PlaneCutHover } from "./plane-cut-hover.js";
import type { PlaneReferenceSource } from "./plane-interior-pick.js";

/** Tools receive evaluated planes or document-local cutting faces. */
export class PlaneReferencePicker {
  private abort = new AbortController();
  private hover: PlaneCutHover;
  accepts: ((frame: PlaneFrame) => boolean) | undefined;
  private faces: CutFacePicker | undefined;
  private leave: (() => void) | undefined;
  private hoverEnabled: ((event: PointerEvent) => boolean) | undefined;
  reference: PlaneReferenceSource | null = null;
  choose: ((frame: PlaneFrame, source?: PlaneReferenceSource) => void) | null = null;
  constructor(private editor: SketchEditor) {
    this.hover = new PlaneCutHover(
      editor,
      (event) => (this.hoverEnabled && !this.hoverEnabled(event) ? undefined : this.accepts),
      () => this.faces,
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
        const hit = pickCutReference(
          editor,
          { x: event.clientX, y: event.clientY },
          this.accepts,
          this.faces,
        );
        if (hit && "surface" in hit) {
          this.hover.clear();
          this.reference = { kind: "face", ...hit.surface };
          this.faces?.choose(structuredClone(hit.surface));
          editor.interactions.current?.history?.checkpoint();
        } else if (hit) this.choose(structuredClone(hit.frame), hit.source);
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
    faces?: CutFacePicker,
  ): void {
    this.faces = faces;
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
    this.faces = undefined;
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
