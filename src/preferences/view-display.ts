export interface ViewDisplay {
  planes: number;
  grid: number;
}
const defaults: ViewDisplay = { planes: 0.06, grid: 0.4 };
const key = "makeshift.view-display";
const listeners = new Set<() => void>();
let value = { ...defaults };
try {
  value = normalized(JSON.parse(localStorage.getItem(key) ?? "null"));
} catch {
  // Unavailable storage keeps window-local preferences.
}
function normalized(input: unknown): ViewDisplay {
  const result = { ...defaults };
  if (!input || typeof input !== "object") return result;
  const candidate = input as Partial<ViewDisplay>;
  for (const field of ["planes", "grid"] as const) {
    const opacity = candidate[field];
    if (typeof opacity === "number" && Number.isFinite(opacity))
      result[field] = Math.max(0, Math.min(1, opacity));
  }
  return result;
}
export function viewDisplay(): ViewDisplay {
  return { ...value };
}
export function setViewDisplay(next: ViewDisplay): void {
  value = normalized(next);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Retain the chosen display for this window.
  }
  for (const listener of listeners) listener();
}
export function resetViewDisplay(): void {
  setViewDisplay(defaults);
}
export function onViewDisplayChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
