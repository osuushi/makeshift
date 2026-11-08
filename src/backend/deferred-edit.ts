import type { VisualPreview } from "../model/visual-preview.js";
import type { SketchDocument } from "../sketch/document.js";
import type { ModelRequest } from "../sketch/model-api.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { acceptedParameters } from "./accepted-parameters.js";
import { continueBodyMetadata } from "./body-metadata.js";
import type { DocumentSession } from "./document-session.js";
import { continuingBodies, materialize } from "./kernel-result.js";
import type { SolidCalculator } from "./solid-calculator.js";
import type { SolidEdits } from "./solid-edits.js";
import type { SurfaceEditRequest } from "./surface-edits.js";

export type MovementRequest = Extract<ModelRequest, { kind: "move-faces" | "move-edges" }>;
export type DeferredEditRequest = MovementRequest | SurfaceEditRequest;

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

async function completeEdit(
  kernel: SolidCalculator,
  solids: SolidEdits,
  document: SketchDocument,
  request: DeferredEditRequest,
): Promise<SketchDocument> {
  if (request.kind === "offset-faces" || request.kind === "finish-edges")
    return continueBodyMetadata(
      document,
      await solids.surfaces.complete(document, request),
      request,
    );
  const bodies = document.bodies ?? [];
  const result = await kernel.calculate({ kind: "complete-preview", bodies });
  return continueBodyMetadata(
    document,
    { ...document, bodies: continuingBodies(bodies, materialize(bodies, result)) },
    request,
  );
}

/** Mesh and completion are separate serialized commands on the same pending edit. */
export async function editPresentation(
  session: DocumentSession,
  kernel: SolidCalculator,
  solids: SolidEdits,
  request: ModelRequest,
  operation: HistoryOperation,
): Promise<boolean> {
  if (request.kind === "complete-preview") {
    const edit = session.beginCompletion();
    session.complete(await completeEdit(kernel, solids, session.store.data, edit));
    return true;
  }
  if (
    (request.kind !== "move-faces" &&
      request.kind !== "move-edges" &&
      request.kind !== "offset-faces" &&
      request.kind !== "finish-edges") ||
    request.presentation !== "deferred"
  )
    return false;
  session.begin(operation);
  const visual =
    request.kind === "offset-faces" || request.kind === "finish-edges"
      ? await solids.surfaces.prepare(session.store.data, request)
      : await prepareMovement(kernel, session.store.data, request);
  const verifiedOperation = acceptedParameters(operation, {
    edgeSize: solids.edgeSize,
    offsetDistance: solids.offsetEdit.view.offsetDistance,
  });
  if (visual) session.drawable(visual, request, verifiedOperation);
  else session.complete(session.store.data, verifiedOperation);
  return true;
}
