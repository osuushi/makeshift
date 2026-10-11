/** Validate the numeric input before requesting a native revolution preview. */
export function revolutionInputError(angle: number, height: number): string | null {
  if (
    Number.isFinite(angle) &&
    Number.isFinite(height) &&
    Math.abs(angle) >= 1e-7 &&
    (height !== 0 || Math.abs(angle) <= 360)
  )
    return null;
  return height === 0 && Math.abs(angle) > 360
    ? "Set a nonzero height for more than one revolution"
    : "Enter a nonzero angle and a finite height";
}

export function revolutionFailureMessage(
  message: string,
  hasCandidate: boolean,
  lastGood: string,
): string {
  return message + (hasCandidate && lastGood ? ` · Showing last valid preview: ${lastGood}` : "");
}
