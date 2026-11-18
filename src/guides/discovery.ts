import type { SketchEditor } from "../sketch/editor.js";
import { modelingKey } from "../sketch/model-selection-state.js";
import type { Point } from "../sketch/planes.js";
import type { GuideCandidate } from "./candidates.js";
import { discoverHoverGuides, guidePointerRadius } from "./hover.js";

type Schedule = (run: () => void) => () => void;

/** Wait for a paint, then use spare main-thread time; WebKit retains a timer fallback. */
const background: Schedule = (run) => {
  let idle = 0,
    timer = 0;
  const frame = requestAnimationFrame(() => {
    if (typeof requestIdleCallback === "function")
      idle = requestIdleCallback(run, { timeout: 100 });
    else timer = window.setTimeout(run, 0);
  });
  return () => {
    cancelAnimationFrame(frame);
    if (idle) cancelIdleCallback(idle);
    clearTimeout(timer);
  };
};

/** Optional candidate work never runs in a pointer, selection or tool refresh callback. */
export class GuideDiscovery {
  private viewKey = "";
  private hoverKey = "";
  private pointer: Point | null = null;
  private document: SketchEditor["display"] | null = null;
  private cancel: (() => void) | null = null;
  private candidates: GuideCandidate[] = [];
  constructor(
    private editor: SketchEditor,
    private changed: () => void,
    private schedule: Schedule = background,
  ) {}
  update(pointer: Point | null, enabled: boolean): GuideCandidate[] {
    const e = this.editor;
    const viewKey =
      enabled && pointer
        ? JSON.stringify([
            e.world.active,
            e.tool,
            e.modeling.targets.map(modelingKey),
            [...e.selectionOwners],
            e.world.camera.matrixWorld.elements,
            e.world.camera.projectionMatrix.elements,
            e.world.canvas.clientWidth,
            e.world.canvas.clientHeight,
            e.world.partialSection,
            e.world.crossSection,
            e.visibility.key,
            e.bodiesVisible,
          ])
        : "";
    const hoverKey = viewKey
      ? JSON.stringify(e.world.active ? e.hover : e.modeling.hover && modelingKey(e.modeling.hover))
      : "";
    const sameView = viewKey === this.viewKey && this.document === e.display;
    if (
      sameView &&
      hoverKey === this.hoverKey &&
      this.pointer?.x === pointer?.x &&
      this.pointer?.y === pointer?.y
    )
      return this.candidates;
    this.cancel?.();
    this.cancel = null;
    this.pointer = pointer;
    this.viewKey = viewKey;
    this.hoverKey = hoverKey;
    this.document = e.display;
    if (!sameView || !pointer) this.candidates = [];
    else {
      // Keep nearby guides while the next hover search runs, then commit the
      // incoming set together after its destination probes finish.
      this.candidates = this.candidates.filter((candidate) => {
        const screen = e.world.project(candidate.point);
        return Math.hypot(screen.x - pointer.x, screen.y - pointer.y) <= guidePointerRadius;
      });
    }
    if (!viewKey) return this.candidates;
    const work = discoverHoverGuides(e, pointer);
    const step = () => {
      this.cancel = null;
      const result = work.next();
      if (result.done) {
        this.candidates = result.value;
        this.changed();
      } else this.cancel = this.schedule(step);
    };
    this.cancel = this.schedule(step);
    return this.candidates;
  }
  dispose(): void {
    this.cancel?.();
    this.cancel = null;
    this.candidates = [];
  }
}
