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
  return {
    ...operation,
    parameters: {
      ...operation.parameters,
      operation: { ...(operation.parameters.operation as object), [key]: value },
    },
  };
}
