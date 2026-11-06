import type { HistoryOperation } from "../sketch/operation-history.js";

/** Keep the accepted measurement, never the rejected overshoot, in transient intent. */
export function acceptedParameters(
  operation: HistoryOperation,
  verified: { edgeSize?: number; offsetDistance?: number },
): HistoryOperation {
  const key = operation.kind === "finish-edges" ? "size" : "distance";
  const value = operation.kind === "finish-edges" ? verified.edgeSize : verified.offsetDistance;
  if (operation.kind !== "finish-edges" && operation.kind !== "offset-faces") return operation;
  if (value === undefined || !Number.isFinite(value))
    throw new Error("No verified measurement for the accepted edit");
  const input = { ...(operation.parameters.operation as Record<string, unknown>), [key]: value };
  // Search policy belongs to temporary calculation intent, not the accepted edit.
  delete input.limit;
  return {
    ...operation,
    parameters: {
      ...operation.parameters,
      operation: input,
    },
  };
}
