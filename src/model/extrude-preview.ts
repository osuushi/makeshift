import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Extrusion } from "./body.js";
import { outwardCapDrawing } from "./outward-cap-drawing.js";
import { PreviewRunner } from "./preview-runner.js";
import { visualExtrusion } from "./visual-preview.js";

type Target = { extrusion: Extrusion; visual: boolean };

/** Visual drag targets never become acceptable candidates; release completes the latest target. */
export class ExtrudePreview {
  valid = false;
  private runner: PreviewRunner<Target>;
  private drawn: Extrusion | null = null;
  private immediate: Extrusion | null = null;
  private wake: (() => void) | null = null;
  constructor(
    private editor: SketchEditor,
    private lease: () => InteractionLease | null,
    private showOperands: () => void,
  ) {
    this.runner = new PreviewRunner({
      editing: () => this.lease()?.phase === "editing",
      calculate: (target) => this.calculate(target),
      settled: () => this.editor.refresh(),
    });
  }
  get latest(): Extrusion | null {
    return this.runner.latest?.extrusion ?? null;
  }
  clear(): void {
    this.wake?.();
    this.runner.clear();
    this.drawn = null;
    this.immediate = null;
    this.valid = false;
  }
  enqueue(extrusion: Extrusion): void {
    this.wake?.();
    const visual = !!(
      this.lease()?.captured && visualExtrusion(extrusion, this.editor.store.data.bodies ?? [])
    );
    this.valid = false;
    const local =
      visual &&
      !this.editor.world.crossSection &&
      !this.editor.world.partialSection &&
      !this.editor.visibility.xray.size
        ? outwardCapDrawing(this.editor.store.data.bodies ?? [], extrusion)
        : null;
    if (local) this.lease()?.showVisual(local);
    else if (this.immediate) this.lease()?.show(null);
    this.immediate = local ? extrusion : null;
    this.runner.enqueue({ extrusion, visual });
  }
  complete(): void {
    this.wake?.();
    const latest = this.runner.latest;
    if (latest?.visual) {
      this.valid = false;
      this.runner.enqueue({ extrusion: latest.extrusion, visual: false });
    }
  }
  async settle(): Promise<void> {
    this.complete();
    await this.runner.settle();
  }
  private async calculate(target: Target): Promise<void> {
    const lease = this.lease();
    if (target.visual && target.extrusion === this.immediate) {
      // The isolated cap is already drawn. Let continuous pointer moves
      // replace it before starting another exact solid. Release wakes it now.
      await new Promise<void>((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          this.wake = null;
          resolve();
        };
        const timer = setTimeout(finish, 90);
        this.wake = finish;
      });
      if (target !== this.runner.latest || lease?.phase !== "editing") return;
    }
    const complete =
      !target.visual && target.extrusion === this.drawn && this.editor.store.visualPreview;
    this.drawn = null;
    const success = await this.editor.store.request(
      complete
        ? { kind: "complete-preview" }
        : {
            kind: "extrude",
            extrusion: target.extrusion,
            ...(target.visual ? { presentation: "visual" } : {}),
          },
    );
    const latest = this.runner.latest;
    if (!latest || lease?.phase !== "editing" || lease !== this.lease()) return;
    if (target.extrusion !== latest.extrusion && this.immediate === latest.extrusion) return;
    this.valid = success && target === latest && !target.visual;
    if (success && target.visual && this.editor.store.visualPreview) {
      this.drawn = target.extrusion;
      lease.showVisual(this.editor.store.visualPreview);
    } else if (success || target === latest)
      lease.show(success ? this.editor.store.candidate : null);
    if (success) this.showOperands();
    this.editor.refresh();
  }
}
