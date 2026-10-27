import type { InteractionLease } from "../sketch/active-interaction.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { Extrusion } from "./body.js";
import { PreviewRunner } from "./preview-runner.js";
import { visualExtrusion } from "./visual-preview.js";

type Target = { extrusion: Extrusion; visual: boolean };

/** Visual drag targets never become acceptable candidates; release completes the latest target. */
export class ExtrudePreview {
  valid = false;
  private runner: PreviewRunner<Target>;
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
    this.runner.clear();
    this.valid = false;
  }
  enqueue(extrusion: Extrusion): void {
    const visual = !!(this.lease()?.captured && visualExtrusion(extrusion));
    this.valid = false;
    this.runner.enqueue({ extrusion, visual });
  }
  complete(): void {
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
    const success = await this.editor.store.request({
      kind: "extrude",
      extrusion: target.extrusion,
      ...(target.visual ? { presentation: "visual" } : {}),
    });
    const lease = this.lease(),
      latest = this.runner.latest;
    if (!latest || lease?.phase !== "editing") return;
    this.valid = success && target === latest && !target.visual;
    if (success && target.visual && this.editor.store.visualPreview)
      lease.showVisual(this.editor.store.visualPreview);
    else if (success || target === latest) lease.show(success ? this.editor.store.candidate : null);
    if (success) this.showOperands();
    this.editor.refresh();
  }
}
