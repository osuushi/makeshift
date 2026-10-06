import type { SketchEditor } from "../sketch/editor.js";
import { type PlaneFrame, planes } from "../sketch/planes.js";
import { type CutFacePicker, pickCutReference } from "./cut-face-reference.js";
import { planeReference } from "./mirror-reference.js";
import { MirrorReferenceView } from "./mirror-reference-view.js";
import { planePatchVertices } from "./plane-interior-pick.js";

/** Presentation uses the same hit as clicking; Entities rows retain their saved target. */
export class PlaneCutHover {
  private abort = new AbortController();
  private view: MirrorReferenceView;
  private visible = false;
  constructor(
    private editor: SketchEditor,
    private accepts: (event: PointerEvent) => ((frame: PlaneFrame) => boolean) | undefined,
    private faces?: () => CutFacePicker | undefined,
  ) {
    this.view = new MirrorReferenceView(editor, true);
    const options = { capture: true, signal: this.abort.signal };
    const document = editor.world.canvas.ownerDocument;
    document.addEventListener("pointermove", this.move, options);
    document.addEventListener("pointerdown", this.clear, options);
    document.addEventListener("pointerleave", this.clear, options);
    editor.world.changed.add(this.clear);
  }
  private move = (event: PointerEvent): void => {
    const accepts = this.accepts(event);
    if (!accepts || this.editor.blocked || event.buttons || event.metaKey || event.ctrlKey) {
      this.clear();
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    // Ordinary model hover would repaint/refresh and clear this tool's reference.
    if (target === this.editor.world.canvas) event.stopImmediatePropagation();
    const label = target?.closest<HTMLElement>("[data-plane]");
    const frame = this.editor.store.data.constructionPlanes?.find(
      (plane) => plane.id === label?.getAttribute("data-plane"),
    )?.frame;
    const hit =
      frame && accepts(frame) && !(label instanceof HTMLButtonElement && label.disabled)
        ? { frame, vertices: planePatchVertices(frame, this.editor.world.planeBounds(frame)) }
        : target === this.editor.world.canvas
          ? pickCutReference(
              this.editor,
              { x: event.clientX, y: event.clientY },
              accepts,
              this.faces?.(),
            )
          : null;
    this.view.show(
      hit
        ? { ...planeReference("frame" in hit ? hit.frame : planes.XY), vertices: hit.vertices }
        : null,
    );
    this.visible = !!hit;
    this.editor.world.present();
  };
  clear = (): void => {
    if (!this.visible) return;
    this.visible = false;
    this.view.show(null);
    this.editor.world.present();
  };
  dispose(): void {
    this.abort.abort();
    this.editor.world.changed.delete(this.clear);
    this.view.dispose();
  }
}
