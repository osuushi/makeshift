import { defaultToolbox } from "../tools/toolbox-defaults.js";
import { normalizeToolbox } from "../tools/toolbox-layout.js";
import {
  addTransformTools,
  migrateToolbox,
  updateSketchTools,
} from "../tools/toolbox-migration.js";
import { regroupToolbox } from "../tools/toolbox-regroup.js";
import { type ToolboxGroup, validToolboxTree } from "../tools/toolbox-tree.js";

const key = "makeshift.toolbox.v8";
const listeners = new Set<() => void>();
let tree = defaultToolbox();
try {
  const current = localStorage.getItem(key);
  const v7 = localStorage.getItem("makeshift.toolbox.v7");
  const v6 = localStorage.getItem("makeshift.toolbox.v6");
  const v5 = localStorage.getItem("makeshift.toolbox.v5");
  const previous = localStorage.getItem("makeshift.toolbox.v4");
  const saved: unknown = JSON.parse(
    current ??
      v7 ??
      v6 ??
      v5 ??
      previous ??
      localStorage.getItem("makeshift.toolbox.v3") ??
      localStorage.getItem("makeshift.toolbox.v2") ??
      "null",
  );
  if (validToolboxTree(saved))
    tree = current
      ? normalizeToolbox(saved)
      : updateSketchTools(
          v7
            ? normalizeToolbox(saved)
            : addTransformTools(
                v6 || v5 ? saved : regroupToolbox(previous ? saved : migrateToolbox(saved)),
              ),
        );
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
