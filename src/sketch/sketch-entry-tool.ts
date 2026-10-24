import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";

/** Enter sketching from the current modeling context, with a deliberate shortcut. */
export function sketchEntryTool(editor: SketchEditor): () => void {
  const catalog = toolCatalog(editor);
  const dispose = catalog.register({
    id: "start-sketch",
    label: "Sketch",
    category: "Sketch",
    shortcut: "⌘Enter",
    aliases: ["new sketch", "start sketching"],
    description: "Start sketching on the selected face or plane",
    finishEdit: false,
    reason: () =>
      editor.workspaceEntry.reason() ?? (editor.world.active ? "Already editing a sketch" : null),
    run: () => editor.workspaceEntry.fromContext(),
  });
  const abort = new AbortController();
  const shortcut = (event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      !(event.metaKey || event.ctrlKey) ||
      event.altKey ||
      event.shiftKey ||
      (event.key !== "Enter" && event.code !== "Enter" && event.code !== "NumpadEnter") ||
      (event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea, select") || event.target.isContentEditable)) ||
      catalog.reason({ reason: () => null })
    )
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void catalog.invoke("start-sketch");
  };
  for (const type of ["keydown", "keypress"] as const)
    onModelKeydown(shortcut, { capture: true, signal: abort.signal }, type);
  return () => {
    abort.abort();
    dispose();
  };
}
