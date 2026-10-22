import { defaultToolbox } from "../tools/toolbox-defaults.js";
import { type ToolboxGroup, toolboxLeaves, validToolboxTree } from "../tools/toolbox-tree.js";

const key = "makeshift.toolbox.v1";
const listeners = new Set<() => void>();
let tree = defaultToolbox();
try {
  const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
  if (validToolboxTree(saved)) tree = saved;
} catch {
  /* Keep defaults if storage is unavailable or invalid. */
}
export function toolboxTree(): ToolboxGroup {
  return structuredClone(tree);
}
export function setToolboxTree(next: ToolboxGroup): void {
  if (!validToolboxTree(next)) return;
  tree = structuredClone(next);
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
/** Newly installed tools get a home without disturbing existing organization. */
export function addToolboxTools(ids: string[]): void {
  const known = new Set(toolboxLeaves(tree));
  const additions = ids.filter((id) => !known.has(id));
  if (additions.length) setToolboxTree({ ...tree, items: [...tree.items, ...additions] });
}
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    try {
      const value: unknown = JSON.parse(event.newValue ?? "null");
      tree = validToolboxTree(value) ? value : defaultToolbox();
      for (const listener of listeners) listener();
    } catch {
      /* Ignore malformed external writes. */
    }
  });
