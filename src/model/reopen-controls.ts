import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import type { ReopenOperation } from "../sketch/reopen-operation.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

/** A single current-geometry operation is undone before ordinary modal reentry. */
export function reopenControls(
  editor: SketchEditor,
  restore: (operation: ReopenOperation) => Promise<void>,
): () => void {
  const abort = new AbortController();
  const catalog = toolCatalog(editor);
  const dispose = catalog.register({
    id: "reopen-operation",
    label: "Reopen last operation",
    category: "Document & Edit",
    shortcut: "⌘/Ctrl R",
    aliases: ["edit last operation", "restore parameters"],
    reason: () =>
      idleReason(editor) ??
      (editor.world.navigation.dragging ? "Release navigation first" : null) ??
      (editor.store.reopenOperation ? null : "The latest accepted edit cannot be reopened"),
    run: async () => {
      const operation = editor.store.reopenOperation;
      if (!operation) return false;
      editor.selectionHistory.finishNavigation();
      editor.numeric.cancel();
      if (!(await editor.store.request({ kind: "reopen" }))) return false;
      editor.pivot = null;
      editor.overlaps = null;
      editor.activeHandle = undefined;
      try {
        await restore(operation);
        return true;
      } catch (error) {
        // The exact original result remains available through ordinary Redo.
        await editor.interactions.cancel();
        throw error;
      }
    },
  });
  onModelKeydown(
    (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "r"
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, button, [contenteditable=true]")
      )
        return;
      event.preventDefault();
      if (!event.repeat) void catalog.invoke("reopen-operation");
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    dispose();
  };
}
