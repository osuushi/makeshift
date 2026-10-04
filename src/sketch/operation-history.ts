import type { ModelRequest } from "./model-api.js";

/** Diagnostic intent, not a replay command or a second geometry document. */
export interface HistoryOperation {
  kind: ModelRequest["kind"] | "script";
  parameters: Record<string, unknown>;
}
export interface OperationHistoryEntry {
  id: number;
  timestamp: string;
  operation: HistoryOperation;
  outcome: "changed" | "noop" | "failed" | "cancelled";
  state: "applied" | "undone" | "superseded" | null;
  error?: string;
}
export function describeOperation(request: ModelRequest): HistoryOperation {
  if (request.kind === "reconstruct-mesh")
    return {
      kind: request.kind,
      parameters: {
        vertices: request.input.mesh?.vertices?.length,
        triangles: request.input.mesh?.triangles?.length,
        tolerance: request.input.tolerance,
        maxPatches: request.input.maxPatches,
      },
    };
  if (request.kind === "open")
    return {
      kind: "open",
      parameters: {
        sketchIds: (Array.isArray(request.document?.sketches) ? request.document.sketches : []).map(
          (s) => s?.id,
        ),
        bodyIds: (Array.isArray(request.document?.bodies) ? request.document.bodies : []).map(
          (b) => b?.id,
        ),
      },
    };
  const { kind, ...parameters } = request;
  return structuredClone({ kind, parameters });
}
