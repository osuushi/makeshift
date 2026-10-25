import type { BodyEdgeFinish } from "../model/body.js";
import type { ModelCall } from "./model-api.js";
import type { Vector } from "./planes.js";

/** A replacement gesture waits for the previous query and its cancellation ACK. */
export class EdgeFinishTargetClient {
  private settled = Promise.resolve();
  constructor(private call: ModelCall) {}
  query(
    operation: Omit<BodyEdgeFinish, "size">,
    points: Vector[],
    signal?: AbortSignal,
  ): Promise<(number | null)[]> {
    let cancelled = signal?.aborted ?? false;
    let started = false;
    let finished = false;
    let stopping: Promise<unknown> | undefined;
    const abort = () => {
      cancelled = true;
      if (started && !finished && !stopping)
        stopping = this.call({ kind: "cancel-edge-finish-targets" }).catch(() => {});
    };
    signal?.addEventListener("abort", abort, { once: true });
    const previous = this.settled;
    const result = (async () => {
      try {
        await previous;
        if (cancelled) throw new Error("Guide fitting cancelled");
        started = true;
        const reply = await this.call({ kind: "edge-finish-targets", operation, points });
        if (cancelled) throw new Error("Guide fitting cancelled");
        if (reply.error || !reply.edgeFinishTargets)
          throw new Error(reply.error ?? "Snap targets unavailable");
        return reply.edgeFinishTargets;
      } finally {
        finished = true;
        await stopping;
        signal?.removeEventListener("abort", abort);
      }
    })();
    this.settled = result.then(
      () => {},
      () => {},
    );
    return result;
  }
}
