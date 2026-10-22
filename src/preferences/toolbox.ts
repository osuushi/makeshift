import { defaultToolbox, normalizeToolbox } from "../tools/toolbox-defaults.js";
import { type ToolboxGroup, validToolboxTree } from "../tools/toolbox-tree.js";

const key = "makeshift.toolbox.v2";
const listeners = new Set<() => void>();
let tree = defaultToolbox();
try {
  const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
  if (validToolboxTree(saved)) tree = normalizeToolbox(saved);
} catch {
  /* Keep defaults if storage is unavailable or invalid. */
}
export function toolboxTree(): ToolboxGroup {
  return structuredClone(tree);
}
export function setToolboxTree(next: ToolboxGroup): void {
  if (!validToolboxTree(next)) return;
  tree = normalizeToolbox(next);
  try {
    localStorage.setItem(key, JSON.stringify(tree));
  } catch {
    /* Keep session preferences. */
  }
  for (const listener of listeners) listener();
}
export function resetToolbox(): void {
  setToolboxTree(defaultToolbox());
}
export function onToolboxChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    try {
      const value: unknown = JSON.parse(event.newValue ?? "null");
      tree = validToolboxTree(value) ? normalizeToolbox(value) : defaultToolbox();
      for (const listener of listeners) listener();
    } catch {
      /* Ignore malformed external writes. */
    }
  });
