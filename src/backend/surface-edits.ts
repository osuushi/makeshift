import type { VisualPreview } from "../model/visual-preview.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import { EdgeSizeLimit } from "./edge-size-limit.js";
import { FaceOffsetEdit } from "./face-offset-edit.js";
import type { DeferredKernelReply } from "./kernel-reply.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export type SurfaceEditRequest = Extract<ModelRequest, { kind: "offset-faces" | "finish-edges" }>;

/** Feasibility needs validated shapes and meshes, not their full editing metadata. */
export class SurfaceEdits {
  readonly offset = new FaceOffsetEdit();
  private edgeLimit = new EdgeSizeLimit<DeferredKernelReply>();
  edgeSize: number | undefined;
  constructor(private kernel: SolidCalculator) {}

  async prepare(
    document: SketchDocument,
    request: SurfaceEditRequest,
  ): Promise<VisualPreview | null> {
    const bodies = document.bodies ?? [];
    const calculate = (value: number) =>
      this.kernel.probe(
        request.kind === "offset-faces"
          ? {
              ...request.operation,
              distance: value,
              kind: "offset-faces",
              bodies,
              presentation: "deferred",
            }
          : {
              ...request.operation,
              size: value,
              kind: "edge-finish",
              bodies,
              presentation: "deferred",
            },
      );
    let value: number, result: DeferredKernelReply | null;
    if (request.kind === "offset-faces") {
      const verified = await this.offset.prepare(document, request.operation, calculate);
      value = verified.distance;
      result = verified.result;
    } else {
      const verified = await this.edgeLimit.calculate(document, request.operation, calculate);
      value = this.edgeSize = verified.size;
      result = verified.result;
    }
    if (!result) {
      await this.kernel.cancel();
      return null;
    }
    // A failed later probe, completed edit or older cached limit may have replaced
    // the one native result. Rebuild only that verified value before publishing it.
    if (!this.kernel.retains(result)) result = await calculate(value);
    return { bodies: result.results, replaces: result.participants };
  }

  async complete(document: SketchDocument, request: SurfaceEditRequest): Promise<SketchDocument> {
    const bodies = document.bodies ?? [];
    const result = await this.kernel.calculate({ kind: "complete-preview", bodies });
    return request.kind === "offset-faces"
      ? this.offset.complete(document, request.operation, result)
      : { ...document, bodies: continuingBodies(bodies, materialize(bodies, result)) };
  }
}
