/** Stable control flow across calculators; diagnostic text is only for people. */
export type CalculationFailureCode =
  | "geometric-infeasibility"
  | "invalid-geometry"
  | "unsupported-input"
  | "invalid-request"
  | "cancelled"
  | "superseded"
  | "timeout"
  | "internal";

export class CalculationFailure extends Error {
  constructor(
    readonly code: CalculationFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CalculationFailure";
  }
}

export function hasFailureCode(error: unknown, code: CalculationFailureCode): boolean {
  return error instanceof CalculationFailure && error.code === code;
}

/** Offset can recover from its geometry validators; finishes search only after
 * the construction boundary has exhausted its supported fallback attempts. */
export function offsetSearchFailure(error: unknown): boolean {
  return (
    hasFailureCode(error, "geometric-infeasibility") || hasFailureCode(error, "invalid-geometry")
  );
}

/** Unknown/malformed native categories are never eligible for feasibility search. */
export function calculationFailure(reply: { error: string; code?: unknown }, fallback: string) {
  const code = reply.code;
  return new CalculationFailure(
    code === "geometric-infeasibility" ||
      code === "invalid-geometry" ||
      code === "unsupported-input" ||
      code === "invalid-request" ||
      code === "cancelled" ||
      code === "superseded" ||
      code === "timeout"
      ? code
      : "internal",
    reply.error || fallback,
    { cause: reply },
  );
}
