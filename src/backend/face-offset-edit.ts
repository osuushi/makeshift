import type { BodyFaceOffset } from "../model/body.js";
import type { SketchDocument } from "../sketch/document.js";
import { continuingBodies, type KernelResult, materialize } from "./kernel-result.js";

/** One gesture's verified candidates; failed geometry never enters the document. */
export class FaceOffsetEdit {
  private document: SketchDocument | null = null;
  private key = "";
  private last: { distance: number; result: KernelResult | null } = { distance: 0, result: null };
  private offsetDistance = 0;
  private offsetSelection: BodyFaceOffset["faces"] = [];
  get view() {
    return { offsetDistance: this.offsetDistance, offsetSelection: this.offsetSelection };
  }
  async calculate(
    document: SketchDocument,
    operation: BodyFaceOffset,
    calculate: (distance: number) => Promise<KernelResult>,
  ): Promise<SketchDocument> {
    const key = JSON.stringify([
      operation.faces,
      operation.radius !== undefined,
      operation.chamfer,
    ]);
    if (this.document !== document || this.key !== key) {
      this.document = document;
      this.key = key;
      this.last = { distance: 0, result: null };
    }
    if (!Number.isFinite(operation.distance)) throw new Error("Enter a finite face offset");
    const verified =
      operation.radius !== undefined
        ? { distance: operation.distance, result: await calculate(operation.distance) }
        : await this.limit(operation.distance, calculate);
    this.last = verified;
    this.offsetDistance = verified.distance;
    this.offsetSelection = operation.faces;
    if (!verified.result) return document;
    const bodies = continuingBodies(
      document.bodies ?? [],
      materialize(document.bodies ?? [], verified.result),
    );
    const selection = verified.result.results.flatMap((result) => {
      const body = bodies.find((b) => b.id === result.predecessorBodies[0]);
      return body
        ? result.faces.flatMap((face, i) =>
            face.offsetSelected ? [{ body: body.id, face: body.faces[i].id }] : [],
          )
        : [];
    });
    this.offsetSelection = selection.length
      ? selection
      : operation.faces.filter((target) =>
          bodies.some(
            (body) => body.id === target.body && body.faces.some((face) => face.id === target.face),
          ),
        );
    return { ...document, bodies };
  }
  private async limit(distance: number, calculate: (distance: number) => Promise<KernelResult>) {
    if (Math.abs(distance) < 1e-8) return { distance: 0, result: null };
    try {
      return { distance, result: await calculate(distance) };
    } catch (error) {
      if (!this.geometricFailure(error)) throw error;
    }
    let low =
      this.last.distance * distance > 0 && Math.abs(this.last.distance) < Math.abs(distance)
        ? this.last
        : { distance: 0, result: null };
    let high = distance;
    for (let i = 0; i < 14 && Math.abs(high - low.distance) > 1e-4; i++) {
      const next = (low.distance + high) / 2;
      try {
        low = { distance: next, result: await calculate(next) };
      } catch (error) {
        if (!this.geometricFailure(error)) throw error;
        high = next;
      }
    }
    return low;
  }
  private geometricFailure(error: unknown): boolean {
    return (
      error instanceof Error &&
      /Kernel produced invalid geometry|Those faces cannot be offset|Offset would (collapse|move)|Face offset must leave/.test(
        error.message,
      )
    );
  }
}
