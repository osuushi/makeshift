import type { BodyErosion } from "../model/body.js";
import type { ModelRequest } from "../sketch/model-api.js";

/** Only a finite, larger allowance from this failed erosion may reach its widget. */
function erosionFeedback(error: unknown, operation: BodyErosion) {
  const reply = error instanceof Error ? error.cause : null;
  const value =
    reply && typeof reply === "object" && "erosionAllowance" in reply
      ? reply.erosionAllowance
      : undefined;
  return typeof value === "number" &&
    Number.isFinite(value) &&
    operation.method === "accurate" &&
    value > (operation.allowance ?? 0)
    ? { erosionAllowance: value }
    : {};
}

/** Translate calculator failures without exposing native reply details to the renderer. */
export function documentFailure(
  error: unknown,
  request: ModelRequest,
  cancelling: boolean,
  superseded: boolean,
) {
  const message = superseded
    ? "Preview superseded"
    : error instanceof Error
      ? error.message
      : String(error);
  const outcome =
    cancelling || superseded || message === "Preview superseded"
      ? ("cancelled" as const)
      : ("failed" as const);
  return {
    error: message,
    outcome,
    ...(request.kind === "erode" && outcome === "failed"
      ? erosionFeedback(error, request.operation)
      : {}),
  };
}
