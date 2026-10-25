import type { VisualPreview } from "../model/visual-preview.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { continueBodyMetadata } from "./body-metadata.js";
import type { DocumentSession } from "./document-session.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";

export type MovementRequest = Extract<ModelRequest, { kind: "move-faces" | "move-edges" }>;

async function prepareMovement(
  kernel: SolidCalculator,
  document: SketchDocument,
  request: MovementRequest,
): Promise<VisualPreview> {
  if (request.operation.bodyIds?.length)
    throw new Error("Combined body and boundary movement requires complete presentation");
  const bodies = document.bodies ?? [];
  const result = await kernel.calculate(
    request.kind === "move-faces"
      ? { ...request.operation, kind: "move-faces", bodies, presentation: "deferred" }
      : { ...request.operation, kind: "move-edges", bodies, presentation: "deferred" },
  );
  return { bodies: result.results, replaces: result.participants };
}

async function completeMovement(
  kernel: SolidCalculator,
  document: SketchDocument,
  request: MovementRequest,
): Promise<SketchDocument> {
  const bodies = document.bodies ?? [];
  const result = await kernel.calculate({ kind: "complete-preview", bodies });
  return continueBodyMetadata(
    document,
    { ...document, bodies: continuingBodies(bodies, materialize(bodies, result)) },
    request,
  );
}

/** Mesh and completion are separate serialized commands on the same pending edit. */
export async function movementPresentation(
  session: DocumentSession,
  kernel: SolidCalculator,
  request: ModelRequest,
  operation: HistoryOperation,
): Promise<boolean> {
  if (request.kind === "complete-preview") {
    const movement = session.deferredMovement;
    session.deferredMovement = null;
    if (!movement) throw new Error("No preview presentation to complete");
    session.candidate = await completeMovement(kernel, session.store.data, movement);
    session.visualPreview = undefined;
    return true;
  }
  if (
    (request.kind !== "move-faces" && request.kind !== "move-edges") ||
    request.presentation !== "deferred"
  )
    return false;
  session.reopenedPreview = null;
  session.pendingOperation = operation;
  session.candidate = null;
  session.visualPreview = undefined;
  session.deferredMovement = null;
  session.visualPreview = await prepareMovement(kernel, session.store.data, request);
  session.deferredMovement = request;
  return true;
}
