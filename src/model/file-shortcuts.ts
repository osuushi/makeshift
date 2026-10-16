import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { toolCatalog } from "../tools/catalog.js";
import type { DocumentCommand } from "./document-host.js";

export function fileShortcuts(
  editor: SketchEditor,
  commands: readonly DocumentCommand[],
): () => void {
  const abort = new AbortController();
  const shortcut = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    const shortcuts: Record<string, DocumentCommand> = {
      n: "new",
      o: "open",
      s: event.shiftKey ? "save-as" : "save",
      w: "close",
    };
    const command = shortcuts[event.key.toLowerCase()];
    if (!command || !commands.includes(command)) return;
    event.preventDefault();
    void toolCatalog(editor).invoke(command);
  };
  for (const type of ["keydown", "keypress"] as const)
    onModelKeydown(shortcut, { signal: abort.signal }, type);
  return () => abort.abort();
}
