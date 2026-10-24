export type RadialDimension = "radius" | "diameter";
const key = "makeshift.radial-dimension";
const listeners = new Set<() => void>();
let current: RadialDimension = "radius";
const valid = (value: unknown): RadialDimension => (value === "diameter" ? value : "radius");
try {
  current = valid(localStorage.getItem(key));
} catch {
  // Storage can be unavailable in private or embedded clients.
}
export function radialDimension(): RadialDimension {
  return current;
}
export function radialName(): string {
  return current === "diameter" ? "Diameter" : "Radius";
}
export function radialDisplay(radius: number): number {
  return radius * (current === "diameter" ? 2 : 1);
}
export function radialRadius(value: number): number {
  return value / (current === "diameter" ? 2 : 1);
}
export function setRadialDimension(value: RadialDimension): void {
  current = valid(value);
  try {
    localStorage.setItem(key, current);
  } catch {
    // Retain the choice in this window when persistence is unavailable.
  }
  for (const listener of listeners) listener();
}
export function onRadialDimensionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    current = valid(event.newValue);
    for (const listener of listeners) listener();
  });
}
