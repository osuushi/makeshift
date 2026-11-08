/** Result status is independent of gesture lifetime and calculation scheduling. */
export type SurfacePreviewResult =
  | { kind: "idle" }
  | { kind: "pending" | "rejected"; requested: number }
  | { kind: "visual" | "exact" | "limited"; requested: number; verified: number };

export function measuredSurfaceResult(
  requested: number,
  verified: number,
  complete: boolean,
): SurfacePreviewResult {
  return {
    kind: complete ? (requested === verified ? "exact" : "limited") : "visual",
    requested,
    verified,
  };
}

export function acceptsSurfaceResult(result: SurfacePreviewResult): boolean {
  return result.kind === "exact" || result.kind === "limited";
}

export function surfaceResultFeedback(result: SurfacePreviewResult): boolean {
  return (
    result.kind === "rejected" ||
    result.kind === "limited" ||
    (result.kind === "visual" && result.requested !== result.verified)
  );
}
