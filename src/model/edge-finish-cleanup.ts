import type { SketchEditor } from "../sketch/editor.js";
import type { BodyEdgeFinish } from "./body.js";
import { CleanupAvailability } from "./cleanup-availability.js";
import type { PreviewRunner } from "./preview-runner.js";

/** Exact cleanup queries share this edge tool's preview slot and candidate lifetime. */
export class EdgeFinishCleanup extends CleanupAvailability {
  constructor(
    private editor: SketchEditor,
    button: HTMLButtonElement,
    private previews: PreviewRunner<BodyEdgeFinish>,
    private eligible: () => boolean,
  ) {
    super(button, () => previews.check(() => this.check()));
  }
  settled(calculated: boolean): void {
    if (calculated) {
      if (this.eligible()) this.schedule();
      else this.reset();
    }
    this.editor.refresh();
  }
  private async check(): Promise<void> {
    const request = this.previews.latest;
    if (!this.eligible()) return;
    const success = await this.editor.store.request({ kind: "check-cleanup" });
    if (request === this.previews.latest && this.eligible())
      this.resolve(this.editor.store.cleanupAvailable, success);
    this.editor.refresh();
  }
}
