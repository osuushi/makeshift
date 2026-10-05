import type { BodyEdgeFinish, BooleanMode, EdgeMovement, FaceMovement } from "../model/body.js";
import {
  type CleanupSelection,
  operationCleanup,
  protectDecorationBoundaries,
} from "../model/cleanup.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { continueBodyMetadata } from "./body-metadata.js";
import { EdgeSizeLimit } from "./edge-size-limit.js";
import { FaceOffsetEdit } from "./face-offset-edit.js";
import { kernelInput, loftInput, revolveInput } from "./kernel-input.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export type SolidRequest = Extract<
  ModelRequest,
  {
    kind:
      | "reconstruct-mesh"
      | "loft"
      | "revolve"
      | "extrude"
      | "transform-bodies"
      | "boolean-bodies"
      | "finish-edges"
      | "offset-faces"
      | "shell"
      | "erode"
      | "move-faces"
      | "move-edges";
  }
>;

export function isSolidRequest(request: ModelRequest): request is SolidRequest {
  return [
    "reconstruct-mesh",
    "loft",
    "revolve",
    "extrude",
    "transform-bodies",
    "boolean-bodies",
    "finish-edges",
    "offset-faces",
    "shell",
    "erode",
    "move-faces",
    "move-edges",
  ].includes(request.kind);
}

/** Geometry calculations and their temporary measurements; no accepted document or history. */
export class SolidEdits {
  readonly offsetEdit = new FaceOffsetEdit();
  private edgeLimit = new EdgeSizeLimit();
  erosionQuality: import("../model/erosion-quality.js").ErosionQuality[] | undefined;
  meshFit: import("../model/mesh-fit.js").MeshFitStatistics | undefined;
  edgeSize: number | undefined;
  edgeSelection: BodyEdgeFinish["edges"] = [];
  booleanTargets: string[] = [];
  booleanMode: BooleanMode | undefined;
  constructor(private kernel: SolidCalculator) {}
  previewQuality(kind: HistoryOperation["kind"] | undefined) {
    return {
      meshFit: kind === "reconstruct-mesh" ? this.meshFit : undefined,
      erosionQuality: kind === "erode" ? this.erosionQuality : undefined,
    };
  }
  async selectFinishEdges(
    document: SketchDocument,
    operation: Omit<BodyEdgeFinish, "size">,
  ): Promise<void> {
    this.edgeSelection = [];
    const result = await this.kernel.calculate({
      ...operation,
      kind: "edge-finish-selection",
      bodies: document.bodies ?? [],
    });
    if (!result.edgeSelection.length) throw new Error("No eligible edges in selection");
    this.edgeSelection = result.edgeSelection;
  }
  async checkCleanup(original: SketchDocument, candidate: SketchDocument): Promise<boolean> {
    const bodies = candidate.bodies ?? [];
    const result = await this.kernel.calculate({
      kind: "cleanup",
      bodies,
      selection: protectDecorationBoundaries(
        candidate,
        operationCleanup(original.bodies ?? [], bodies),
      ),
    });
    return result.participants.length > 0;
  }
  async removeTopology(
    document: SketchDocument,
    selection: CleanupSelection[],
    kind: "cleanup" | "delete-topology" = "cleanup",
  ): Promise<SketchDocument> {
    const bodies = document.bodies ?? [];
    const result = await this.kernel.calculate({
      kind,
      selection: kind === "cleanup" ? protectDecorationBoundaries(document, selection) : selection,
      bodies,
    });
    return result.participants.length
      ? continueBodyMetadata(document, {
          ...document,
          bodies: continuingBodies(bodies, materialize(bodies, result)),
        })
      : document;
  }
  private async move(
    document: SketchDocument,
    request:
      | { kind: "move-faces"; operation: FaceMovement }
      | { kind: "move-edges"; operation: EdgeMovement },
  ): Promise<SketchDocument> {
    const bodies = document.bodies ?? [];
    const ids = request.operation.bodyIds ?? [];
    const componentBodies =
      request.kind === "move-faces"
        ? request.operation.faces.map((t) => t.body)
        : request.operation.edges.map((t) => t.body);
    if (ids.some((id) => componentBodies.includes(id)))
      throw new Error("Whole-body and component movement must target disjoint bodies");
    const result = await this.kernel.calculate(
      request.kind === "move-edges"
        ? { ...request.operation, kind: "move-edges", bodies }
        : { ...request.operation, kind: "move-faces", bodies },
    );
    let next = continuingBodies(bodies, materialize(bodies, result));
    if (ids.length) {
      const transform = await this.kernel.calculate({
        kind: "transform",
        bodies,
        ids,
        duplicate: false,
        translation: request.operation.translation,
        pivot: request.kind === "move-faces" ? request.operation.pivot : [0, 0, 0],
        axis: request.kind === "move-faces" ? request.operation.axis : [0, 0, 1],
        angle: request.kind === "move-faces" ? request.operation.angle : 0,
      });
      const transformed = materialize(bodies, transform);
      const continued = continuingBodies(bodies, transformed);
      next = next.map((body, index) => (ids.includes(body.id) ? continued[index] : body));
    }
    return { ...document, bodies: next };
  }
  private async reconstruct(
    document: SketchDocument,
    input: import("../model/mesh-fit.js").MeshReconstructionInput,
  ): Promise<SketchDocument> {
    const result = await this.kernel.calculate({
      mesh: input.mesh,
      tolerance: input.tolerance,
      maxPatches: input.maxPatches,
      smoothAngle: input.smoothAngle,
      kind: "fit-mesh",
      bodies: [],
    });
    this.meshFit = result.fit;
    return { ...document, bodies: materialize(document.bodies ?? [], result) };
  }
  private async erode(
    document: SketchDocument,
    operation: import("../model/body.js").BodyErosion,
  ): Promise<SketchDocument> {
    const bodies = document.bodies ?? [];
    const {
      thickness,
      allowance = 0,
      keepOriginals,
      method,
      meshDetail = "standard",
      maxFaces = 128,
    } = operation;
    if (method !== undefined && method !== "fast" && method !== "accurate")
      throw new Error("Choose Remesh or Analytic erosion");
    if (
      !Number.isFinite(thickness) ||
      thickness <= 1e-5 ||
      (method === "accurate" && (!Number.isFinite(allowance) || allowance < 0)) ||
      (keepOriginals !== undefined && typeof keepOriginals !== "boolean")
    )
      throw new Error(
        "Erode needs positive finite thickness and nonnegative extra thickness allowance",
      );
    if (
      method !== "accurate" &&
      (!["coarse", "standard", "fine"].includes(meshDetail) ||
        !Number.isInteger(maxFaces) ||
        maxFaces < 32 ||
        maxFaces > 256)
    )
      throw new Error(
        "Remesh needs Coarse, Standard or Fine mesh detail and a CAD face budget from 32 to 256",
      );
    const result = await this.kernel.calculate({ ...operation, kind: "erode", bodies });
    this.erosionQuality = result.erosionQuality;

    return { ...document, bodies: materialize(bodies, result) };
  }
  async calculate(document: SketchDocument, request: SolidRequest): Promise<SketchDocument> {
    let candidate: SketchDocument;
    this.meshFit = undefined;
    this.erosionQuality = undefined;
    const bodies = document.bodies ?? [];
    if (request.kind === "reconstruct-mesh") {
      candidate = await this.reconstruct(document, request.input);
    } else if (request.kind === "move-faces" || request.kind === "move-edges") {
      candidate = await this.move(document, request);
    } else if (request.kind === "erode") {
      candidate = await this.erode(document, request.operation);
    } else if (request.kind === "shell") {
      if (!Number.isFinite(request.operation.thickness))
        throw new Error("Enter a finite shell thickness");
      const result = await this.kernel.calculate({ ...request.operation, kind: "shell", bodies });
      candidate = { ...document, bodies: continuingBodies(bodies, materialize(bodies, result)) };
    } else if (request.kind === "offset-faces") {
      candidate = await this.offsetEdit.calculate(document, request.operation, (distance) =>
        this.kernel.probe({ ...request.operation, distance, kind: "offset-faces", bodies }),
      );
    } else if (request.kind === "finish-edges") {
      const result = await this.edgeLimit.calculate(document, request.operation, (size) =>
        this.kernel.probe({ ...request.operation, size, kind: "edge-finish", bodies }),
      );
      this.edgeSize = result.size;
      candidate = result.result
        ? {
            ...document,
            bodies: continuingBodies(bodies, materialize(bodies, result.result)),
          }
        : document;
    } else if (request.kind === "transform-bodies") {
      const result = await this.kernel.calculate({
        ...request.transform,
        kind: "transform",
        bodies,
      });
      const transformed = materialize(bodies, result);
      candidate = {
        ...document,
        bodies: request.transform.duplicate ? transformed : continuingBodies(bodies, transformed),
      };
    } else {
      const result = await this.kernel.calculate(
        request.kind === "boolean-bodies"
          ? { ...request.operation, kind: "boolean", bodies }
          : request.kind === "loft"
            ? loftInput(document, request.operation, bodies)
            : request.kind === "revolve"
              ? revolveInput(document, request.revolution, bodies)
              : kernelInput(document, request.extrusion, bodies),
      );
      this.booleanMode = result.mode;
      this.booleanTargets = result.participants;
      const next = materialize(bodies, result);
      candidate = {
        ...document,
        bodies: next,
      };
    }
    return continueBodyMetadata(document, candidate, request);
  }
}
