import type { InteractionLease } from "./active-interaction.js";
import type { Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { GestureSolve } from "./gesture-solve.js";
import { trimOverlappingSketch } from "./trim-edit.js";
import type { TrimSpan } from "./trim-geometry.js";

/** Own the original sketch through a held brush stroke and its final validated rewrite. */
export class TrimGesture {
  readonly interaction: InteractionLease | null;
  private solve: GestureSolve | null = null;
  private cancelled = false;
  private cancelling: Promise<void> | null = null;
  private ended = false;
  constructor(
    private editor: SketchEditor,
    readonly sketch: Sketch,
    private done: () => void,
  ) {
    this.interaction = editor.interactions.acquire("trim", this.cancel, undefined, {
      navigation: "when-released",
    });
  }
  private cancel = (): Promise<void> => {
    if (this.cancelling) return this.cancelling;
    if (!this.interaction?.close()) return Promise.resolve();
    this.cancelled = true;
    this.cancelling = this.discard();
    return this.cancelling;
  };
  private async discard(): Promise<void> {
    try {
      await this.solve?.cancel();
    } finally {
      this.end();
    }
  }
  private end(): void {
    if (this.ended) return;
    this.ended = true;
    this.interaction?.release();
    this.done();
  }
  async finish(spans: readonly TrimSpan[]): Promise<void> {
    const interaction = this.interaction;
    if (!interaction || this.cancelled || !interaction.wait()) return;
    interaction.releaseCapture();
    try {
      if (!spans.length) return;
      const result = trimOverlappingSketch(this.sketch, spans);
      this.solve = new GestureSolve(this.editor, interaction);
      this.solve.update(result.sketch, { kind: "direct", curveOrigins: result.curveOrigins });
      const valid = await this.solve.flush();
      if (this.cancelled) return;
      if (!valid) {
        await this.solve.cancel();
        return;
      }
      if (!interaction.close()) return;
      if (await this.editor.accept()) this.editor.select([]);
    } catch (error) {
      this.editor.message = error instanceof Error ? error.message : String(error);
    } finally {
      await this.cancelling;
      this.end();
    }
  }
}
