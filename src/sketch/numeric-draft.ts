export type NumericDraft =
  | { kind: "unfinished" | "invalid"; value: null }
  | { kind: "value"; value: number };

/** Parse text, preserving drafts. Quantity rules (sign, zero, bounds) belong to the tool. */
export function parseNumericDraft(text: string): NumericDraft {
  const trimmed = text.trim();
  if (!trimmed || /^[+-]?\.?$/.test(trimmed) || /^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?$/.test(trimmed))
    return { kind: "unfinished", value: null };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { kind: "value", value } : { kind: "invalid", value: null };
}
