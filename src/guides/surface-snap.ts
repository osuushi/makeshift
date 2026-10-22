import type { SketchEditor } from "../sketch/editor.js";
import { GuideDragFeedback } from "./drag-feedback.js";
import { near } from "./geometry.js";
import { GuideMoveChooser } from "./move-chooser.js";
import { type GuideMoveCandidate, type GuideMoveTarget, guideMoveProbe } from "./move-target.js";
import type { GuideSurfacePlan } from "./tool-path.js";
import { guidesVisible, observeGuides } from "./view-state.js";

const activeTargets = new WeakMap<SketchEditor, readonly GuideMoveCandidate[]>();
const activeDrags = new WeakSet<SketchEditor>();
export const surfaceDragTargets = (editor: SketchEditor) => activeTargets.get(editor);
export const surfaceDragActive = (editor: SketchEditor) => activeDrags.has(editor);

/** Snap feedback borrows a tool gesture. Its controller still owns preview and Undo. */
export class GuideSurfaceSnap {
  private plan: GuideSurfacePlan | null = null;
  private targets: GuideMoveCandidate[] = [];
  private feedback: GuideDragFeedback | null = null;
  private chooser: GuideMoveChooser | null = null;
  private event: PointerEvent | null = null;
  private fallback = 0;
  private scale = 1;
  private pending: { target: GuideMoveTarget; value: number } | null = null;
  private confirmed: { target: GuideMoveTarget; value: number } | null = null;
  private create: (() => GuideSurfacePlan | null) | null = null;
  private unobserve: () => void;
  constructor(
    private editor: SketchEditor,
    private host: HTMLElement,
    private queue: (value: number) => void,
  ) {
    this.unobserve = observeGuides(editor, () => this.visibilityChanged());
  }
  start(create: () => GuideSurfacePlan | null): void {
    this.clear();
    this.create = create;
    activeDrags.add(this.editor);
    this.visibilityChanged();
  }
  private visibilityChanged(): void {
    if (!this.create) return;
    if (!guidesVisible(this.editor)) {
      this.pending = this.confirmed = null;
      activeTargets.delete(this.editor);
      this.chooser?.close();
      this.feedback?.hide();
      if (this.event) this.queue(this.fallback);
      return;
    }
    if (!this.plan) this.initialize(this.create());
    else {
      activeTargets.set(this.editor, this.targets);
      this.feedback?.destinations.show(this.plan.origin, this.targets);
    }
    if (this.event) this.move(this.event, this.fallback, this.scale);
  }
  private initialize(plan: GuideSurfacePlan | null): void {
    if (!plan || !guidesVisible(this.editor)) return;
    this.plan = plan;
    this.feedback = new GuideDragFeedback(this.editor, this.host, false);
    if (plan.targets instanceof Promise) this.feedback.destinations.pending(plan.origin);
    this.chooser = new GuideMoveChooser(
      this.editor,
      (target) => this.apply(target),
      () => {
        if (this.event) this.move(this.event, this.fallback, this.scale);
      },
    );
    activeTargets.set(this.editor, []);
    void Promise.resolve(plan.targets)
      .then((targets) => {
        if (this.plan !== plan) return;
        this.targets = targets;
        if (guidesVisible(this.editor)) {
          activeTargets.set(this.editor, targets);
          this.feedback?.destinations.show(plan.origin, targets);
        }
        this.editor.refresh();
        if (this.event) this.move(this.event, this.fallback, this.scale);
      })
      .catch(() => {
        if (this.plan === plan) this.clear();
      });
  }
  move(event: PointerEvent, fallback: number, scale = 1): void {
    this.event = event;
    this.fallback = fallback;
    this.scale = scale;
    if (!this.plan || !guidesVisible(this.editor)) {
      this.queue(fallback);
      return;
    }
    const probe = event.shiftKey
      ? { target: null, choices: [] }
      : guideMoveProbe(this.editor, this.targets, { x: event.clientX, y: event.clientY });
    const target =
      this.chooser?.opened && !event.shiftKey ? this.chooser?.drag(event) : probe.target;
    this.chooser?.track(event, probe.choices, target);
    this.feedback?.destinations.suppress(event.shiftKey);
    this.apply(target, probe.choices);
  }
  private apply(target: GuideMoveTarget | null, potential: GuideMoveTarget[] = []): void {
    const plan = this.plan;
    if (!plan) return;
    const value = target?.distance === undefined ? this.fallback : target.distance * this.scale;
    this.queue(value);
    const confirmed =
      target && this.confirmed?.value === value && near(this.confirmed.target.point, target.point);
    this.feedback?.show(plan.origin, this.targets, confirmed ? target : null, potential);
    if (!target || target.distance === undefined) {
      this.pending = null;
      this.confirmed = null;
      return;
    }
    if (this.pending?.value === value && near(this.pending.target.point, target.point)) return;
    const pending = { target, value };
    this.pending = pending;
    void plan.settled(value).then((valid) => {
      if (this.plan !== plan || this.pending !== pending) return;
      if (valid) {
        this.confirmed = pending;
        this.feedback?.show(plan.origin, this.targets, target, []);
      } else {
        this.targets = this.targets.filter((p) => p.distance !== target.distance);
        activeTargets.set(this.editor, this.targets);
        this.chooser?.close();
        this.feedback?.destinations.show(plan.origin, this.targets);
        this.editor.refresh();
        this.apply(null);
      }
    });
  }
  clear(): void {
    this.plan = null;
    this.create = null;
    this.targets = [];
    this.pending = this.confirmed = null;
    this.event = null;
    activeTargets.delete(this.editor);
    activeDrags.delete(this.editor);
    this.chooser?.dispose();
    this.feedback?.dispose();
    this.chooser = null;
    this.feedback = null;
  }
  dispose(): void {
    this.clear();
    this.unobserve();
  }
}
