import type { BodyEdgeFinish } from "../model/body.js";
import { minimumFinishMm } from "../model/geometry-policy.js";
import type { SketchDocument } from "../sketch/document.js";
import type { KernelResult } from "./kernel-result.js";

type Verified<Result> = { size: number; result: Result };
type Calculate<Result> = (size: number) => Promise<Result>;
/** Feasibility is local to one fixed selection on one immutable document.
 * Retain only verified geometry; this is not a claim of a global mathematical maximum. */
export class EdgeSizeLimit<Result = KernelResult> {
  private document: SketchDocument | null = null;
  private key = "";
  private best: Verified<Result> | null = null;
  private upper = Infinity;
  async calculate(
    document: SketchDocument,
    operation: BodyEdgeFinish,
    calculate: Calculate<Result>,
  ) {
    const key = JSON.stringify([operation.mode, operation.edges]);
    if (this.document !== document || this.key !== key) {
      this.document = document;
      this.key = key;
      this.best = null;
      this.upper = Infinity;
    }
    if (!Number.isFinite(operation.size)) throw new Error("Enter a finite edge size");
    if (operation.size < minimumFinishMm) return { size: 0, result: null };
    if (this.best && operation.size >= this.upper) return this.best;
    const requested = await this.probe(operation.size, calculate);
    if (requested) {
      if (!this.best || requested.size > this.best.size) this.best = requested;
      return requested;
    }
    const bodies =
      document.bodies?.filter((b) => operation.edges.some((e) => e.body === b.id)) ?? [];
    const scale = Math.max(
      1e-3,
      ...bodies.map((b) =>
        Math.hypot(b.bounds[3] - b.bounds[0], b.bounds[4] - b.bounds[1], b.bounds[5] - b.bounds[2]),
      ),
    );
    let low = this.best && this.best.size < operation.size ? this.best : null;
    if (!low) {
      let seed = Math.min(operation.size / 2, scale * 1e-3);
      for (let i = 0; i < 8 && seed >= minimumFinishMm && !low; i++, seed /= 2)
        low = await this.probe(seed, calculate);
    }
    if (!low) throw new Error("Could not find a feasible size for all selected edges");
    let high = operation.size;
    // First bracket near the feasible geometry, even for a huge typed request.
    for (let i = 0; i < 24 && low.size * 2 < high; i++) {
      const size = low.size * 2,
        next = await this.probe(size, calculate);
      if (!next) {
        high = size;
        break;
      }
      low = next;
    }
    // Always return the verified side of the boundary, never a rounded-up estimate.
    for (let i = 0; i < 14 && high - low.size > Math.max(1e-4, scale * 1e-5); i++) {
      const size = (low.size + high) / 2,
        next = await this.probe(size, calculate);
      if (next) low = next;
      else high = size;
    }
    const rounded = Math.floor(low.size * 1e4) / 1e4;
    if (rounded > 1e-8 && rounded < low.size) low = (await this.probe(rounded, calculate)) ?? low;
    this.best = low;
    this.upper = high;
    return low;
  }
  private async probe(
    size: number,
    calculate: Calculate<Result>,
  ): Promise<Verified<Result> | null> {
    try {
      return { size, result: await calculate(size) };
    } catch (error) {
      if (error instanceof Error && error.message.includes("not feasible at this size"))
        return null;
      throw error;
    }
  }
}
