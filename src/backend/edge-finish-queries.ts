import { exactBodies } from "../model/exact-body.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { SolidCalculator } from "./solid-calculator.js";

type Query = Extract<ModelRequest, { kind: "edge-finish-targets" }>;
type Sizes = (number | null)[];
type Active = { key: string; cancelled: boolean; promise: Promise<Sizes> };

/** Guide fitting can be abandoned without interrupting measurements or edits. */
export class EdgeFinishQueries {
  private kernel: SolidCalculator;
  private active: Active | null = null;
  private context = "";
  private results = new Map<string, Sizes>();
  private closed = false;
  constructor(executable?: string) {
    this.kernel = new SolidCalculator(executable);
  }
  async calculate(document: SketchDocument, request: Query): Promise<Sizes> {
    if (this.closed) throw new Error("Guide fitting closed");
    const bodies = exactBodies(
      (document.bodies ?? []).filter((body) =>
        request.operation.edges.some((edge) => edge.body === body.id),
      ),
    );
    const context = JSON.stringify([bodies, request.operation]);
    const points = JSON.stringify(request.points);
    const key = JSON.stringify([context, points]);
    if (this.active?.key === key) return this.active.promise;
    if (context !== this.context) {
      this.context = context.length <= 32 * 1024 * 1024 ? context : "";
      this.results.clear();
    }
    const cached = this.results.get(points);
    const stopped = this.cancel();
    if (cached) {
      await stopped;
      return [...cached];
    }
    const task: Active = { key, cancelled: false, promise: Promise.resolve([]) };
    task.promise = (async () => {
      await stopped;
      if (task.cancelled || this.closed) throw new Error("Guide fitting cancelled");
      const reply = await this.kernel.calculate({
        ...request.operation,
        kind: "edge-finish-targets",
        points: request.points,
        bodies,
      });
      if (task.cancelled || this.closed) throw new Error("Guide fitting cancelled");
      const sizes = reply.edgeFinishTargets;
      if (
        this.context === context &&
        context.length <= 32 * 1024 * 1024 &&
        points.length <= 128 * 1024
      ) {
        // At most eight point sets for one exact source/selection/mode. Null is
        // a verified unreachable target too; cancelled/failed work never enters.
        this.results.set(points, [...sizes]);
        const oldest = this.results.keys().next().value;
        if (this.results.size > 8 && oldest !== undefined) this.results.delete(oldest);
      }
      return sizes;
    })().finally(() => {
      if (this.active === task) this.active = null;
    });
    this.active = task;
    return task.promise;
  }
  async cancel(): Promise<void> {
    const task = this.active;
    if (!task) return;
    this.active = null;
    task.cancelled = true;
    await Promise.allSettled([this.kernel.cancel(), task.promise]);
  }
  close(): void {
    this.closed = true;
    if (this.active) this.active.cancelled = true;
    this.results.clear();
    this.context = "";
    this.kernel.close();
  }
}
