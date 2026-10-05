export const decoratorKinds = ["threads", "gear", "knurling", "custom"] as const;
export type DecoratorKind = (typeof decoratorKinds)[number];
export interface DecoratorAppearance {
  color: string;
  opacity: number;
}
export interface DecoratorDisplay {
  mode: "detailed" | "color-only";
  types: Record<DecoratorKind, DecoratorAppearance>;
}
const defaults: DecoratorDisplay = {
  mode: "detailed",
  types: {
    threads: { color: "#227c88", opacity: 0.78 },
    gear: { color: "#a36424", opacity: 0.78 },
    knurling: { color: "#72539c", opacity: 0.78 },
    custom: { color: "#337c65", opacity: 0.78 },
  },
};
const key = "makeshift.decorator-display";
const listeners = new Set<() => void>();
let value = structuredClone(defaults);
try {
  value = normalized(JSON.parse(localStorage.getItem(key) ?? "null"));
} catch {
  // Unavailable storage keeps window-local preferences.
}

function normalized(input: unknown): DecoratorDisplay {
  const result = structuredClone(defaults);
  if (!input || typeof input !== "object") return result;
  const candidate = input as Partial<DecoratorDisplay>;
  if (candidate.mode === "color-only") result.mode = candidate.mode;
  for (const kind of decoratorKinds) {
    const appearance = candidate.types?.[kind];
    if (!appearance) continue;
    if (typeof appearance.color === "string" && /^#[\da-f]{6}$/i.test(appearance.color))
      result.types[kind].color = appearance.color;
    if (Number.isFinite(appearance.opacity))
      result.types[kind].opacity = Math.max(0.2, Math.min(1, appearance.opacity));
  }
  return result;
}
export function decoratorKind(definition: string): DecoratorKind {
  return decoratorKinds.find((kind) => definition === `freac.${kind}`) ?? "custom";
}
export function decoratorDisplay(): DecoratorDisplay {
  return structuredClone(value);
}
export function decoratorPreviewMode(): DecoratorDisplay["mode"] {
  return value.mode;
}
export function decoratorAppearance(definition: string): DecoratorAppearance {
  return { ...value.types[decoratorKind(definition)] };
}
export function setDecoratorDisplay(next: DecoratorDisplay): void {
  value = normalized(next);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Retain the chosen display for this window.
  }
  for (const listener of listeners) listener();
}
export function resetDecoratorDisplay(): void {
  setDecoratorDisplay(defaults);
}
export function onDecoratorDisplayChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
