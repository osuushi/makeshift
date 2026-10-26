import { type PlaneFrame, type Vector, validateFrame } from "../sketch/planes.js";

export function requireKernel(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid solid kernel reply: ${field}`);
}
export function object(value: unknown): Record<string, unknown> {
  requireKernel(value && typeof value === "object" && !Array.isArray(value), "object");
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  requireKernel(Array.isArray(value), "array");
  return value;
}
export function number(value: unknown): number {
  requireKernel(typeof value === "number" && Number.isFinite(value), "finite number");
  return value;
}
export function positive(value: unknown): number {
  const result = number(value);
  requireKernel(result > 0, "positive dimension");
  return result;
}
export function text(value: unknown): string {
  requireKernel(typeof value === "string" && value.length > 0, "string");
  return value;
}
export function flag(value: unknown): void {
  requireKernel(typeof value === "boolean", "boolean");
}
export function sign(value: unknown): void {
  requireKernel(value === 1 || value === -1, "orientation");
}
export function numbers(value: unknown, length?: number): number[] {
  const result = array(value);
  requireKernel(
    result.every((value) => typeof value === "number" && Number.isFinite(value)),
    "finite number",
  );
  requireKernel(length === undefined || result.length === length, "coordinate count");
  return result as number[];
}
export function vector(value: unknown, unit = false): Vector {
  const result = numbers(value, 3) as Vector;
  requireKernel(!unit || Math.abs(Math.hypot(...result) - 1) <= 1e-7, "unit direction");
  return result;
}
export function meshNormals(value: unknown, coordinateCount: number): void {
  if (value === undefined) return; // Older kernels and mesh-only fixtures.
  const normals = numbers(value, coordinateCount);
  for (let i = 0; i < normals.length; i += 3)
    requireKernel(
      Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1) <= 1e-5,
      "unit mesh normal",
    );
}
export function bounds(value: unknown): void {
  const result = numbers(value, 6);
  requireKernel(
    result.slice(0, 3).every((v, i) => v <= result[i + 3]),
    "ordered bounds",
  );
}
export function frame(value: unknown): void {
  const result = object(value);
  vector(result.origin);
  vector(result.u, true);
  vector(result.v, true);
  validateFrame(result as unknown as PlaneFrame);
}
export function references(value: unknown, known: ReadonlySet<string>): string[] {
  const result = array(value).map(text);
  requireKernel(
    result.every((id) => known.has(id)),
    "topology correspondence",
  );
  requireKernel(new Set(result).size === result.length, "duplicate correspondence");
  return result;
}
export function indexes(value: unknown, count: number): void {
  requireKernel(
    array(value).every((i) => typeof i === "number" && Number.isInteger(i) && i >= 0 && i < count),
    "topology index",
  );
}
export function analyticCurve(value: unknown, topology = false): void {
  const c = object(value);
  if (c.kind === "other" && topology) return;
  if (c.kind === "circle") {
    vector(c.center);
    vector(c.normal, true);
    positive(c.radius);
    if (topology) {
      vector(c.xAxis, true);
      number(c.start);
      number(c.end);
    }
    return;
  }
  requireKernel(c.kind === "line" || (c.kind === "arc" && !topology), "edge curve kind");
  vector(c.a);
  vector(c.b);
  if (c.kind === "arc") vector(c.mid);
}
