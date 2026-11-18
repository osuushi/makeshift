const invisible = /[\p{C}\p{Zl}\p{Zp}]/u;
export function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    value.length <= 192 &&
    [...value].length <= 96 &&
    !invisible.test(value)
  );
}
export function safeName(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const visible: string[] = [];
  for (const char of value) {
    if (!invisible.test(char)) visible.push(char);
    if (visible.length === 96) break;
  }
  return visible.join("").trim() || fallback;
}
export function validId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && value.length <= 512 && !invisible.test(value)
  );
}
