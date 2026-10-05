import type { BodyTransform } from "./body.js";

/** Ordinary body gestures have one XYZ translation or rotation, not a composite. */
export function reopenBodyTransform(edit: BodyTransform): {
  axis: "X" | "Y" | "Z";
  value: number;
  rotate: boolean;
} | null {
  const rotate = edit.angle !== 0;
  if (rotate && edit.translation.some((value) => value !== 0)) return null;
  const vector = rotate ? edit.axis : edit.translation;
  const indices = vector.flatMap((value, i) => (value !== 0 ? [i] : []));
  if (indices.length > 1) return null;
  const index = indices[0] ?? 0;
  return {
    axis: (["X", "Y", "Z"] as const)[index],
    value: rotate ? edit.angle * Math.sign(vector[index]) : vector[index],
    rotate,
  };
}
