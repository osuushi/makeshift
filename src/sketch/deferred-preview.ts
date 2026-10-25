import type { ModelCall, ModelReply, ModelRequest } from "./model-api.js";

/** One mesh-first request. Refinement yields to paint and to the next tool target. */
export class DeferredPreview {
  superseded = false;
  private completing = false;
  private cancelPaint: (() => void) | null = null;

  /** Only refinement is interrupted; geometry already in flight may still draw. */
  supersede(): boolean {
    this.superseded = true;
    this.cancelPaint?.();
    return this.completing;
  }

  async run(
    request: ModelRequest,
    call: ModelCall,
    show: (reply: ModelReply) => void,
  ): Promise<ModelReply> {
    if (this.superseded) throw new Error("Preview superseded");
    const reply = await call(request);
    if (reply.error || !reply.view.visualPreview) return reply;
    show(reply);
    // Edge finishes remain a drawing until the tool explicitly completes them.
    // Volume and editing metadata must not occupy the drag calculator after paint.
    if (request.kind === "finish-edges") {
      if (this.superseded) throw new Error("Preview superseded");
      return reply;
    }
    if (!this.superseded) await this.painted();
    if (this.superseded) throw new Error("Preview superseded");
    this.completing = true;
    return call({ kind: "complete-preview" });
  }

  private painted(): Promise<void> {
    return new Promise((resolve) => {
      // A frame callback runs before paint. The second frame lets the first
      // mesh draw reach the screen before we occupy the calculator again.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(finish);
      });
      const finish = () => {
        cancelAnimationFrame(frame);
        this.cancelPaint = null;
        resolve();
      };
      this.cancelPaint = finish;
    });
  }
}
