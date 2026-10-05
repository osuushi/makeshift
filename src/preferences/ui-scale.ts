export const uiScaleChoices = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
const key = "makeshift.ui-scale";
const listeners = new Set<() => void>();
let scale = 1;
try {
  scale = validScale(Number(localStorage.getItem(key)));
} catch {
  // Settings remain usable when storage is unavailable.
}
apply();

function validScale(value: number): number {
  return uiScaleChoices.some((choice) => choice === value) ? value : 1;
}
function apply(): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--ui-scale", String(scale));
}
export function uiScale(): number {
  return scale;
}
export function setUiScale(value: number): void {
  scale = validScale(value);
  apply();
  try {
    localStorage.setItem(key, String(scale));
  } catch {
    // Retain the chosen scale for this window.
  }
  for (const listener of listeners) listener();
}
export function onUiScaleChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
