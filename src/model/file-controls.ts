import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { BrowserDocuments } from "./browser-documents.js";
import { exportControls } from "./export-controls.js";
import { fileShortcuts } from "./file-shortcuts.js";
import { nativeFileControls } from "./native-file-controls.js";

/** Data-only archive: opening never evaluates stored expressions or scripts. */
export function fileControls(editor: SketchEditor, container: HTMLElement): () => void {
  if (window.makeshiftDocument) return nativeFileControls(editor, window.makeshiftDocument);
  const documents = new BrowserDocuments(editor);
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".makeshift,.freac,application/json";
  input.hidden = true;
  input.setAttribute("aria-label", "Open Makeshift file");
  container.append(input);
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) await documents.open(file);
    input.value = "";
  };
  const disposeExport = exportControls(editor);
  const reason = () => idleReason(editor);
  const catalog = toolCatalog(editor);
  const disposeShortcuts = fileShortcuts(editor, ["new", "open", "save", "save-as"]);
  const disposers = [
    catalog.register({
      id: "save",
      finishEdit: true,
      label: "Save document",
      showInTools: false,
      shortcut: "⌘S",
      category: "Document & Edit",
      reason,
      run: async () => {
        await documents.save();
      },
    }),
    catalog.register({
      id: "save-as",
      finishEdit: true,
      label: "Save document as…",
      showInTools: false,
      shortcut: "⇧⌘S",
      category: "Document & Edit",
      reason,
      run: async () => {
        await documents.save(true);
      },
    }),
    catalog.register({
      id: "open",
      finishEdit: true,
      label: "Open document",
      showInTools: false,
      shortcut: "⌘O",
      category: "Document & Edit",
      reason,
      run: () => input.click(),
    }),
    catalog.register({
      id: "new",
      finishEdit: true,
      label: "New document",
      showInTools: false,
      shortcut: "⌘N",
      category: "Document & Edit",
      reason,
      run: () => documents.newDocument(),
    }),
  ];
  return () => {
    documents.dispose();
    disposeShortcuts();
    disposeExport();
    for (const dispose of disposers) dispose();
    input.remove();
  };
}
