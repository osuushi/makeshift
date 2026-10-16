import { selectionContext } from "../model/selection-context.js";
import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { toolCatalog } from "../tools/catalog.js";
import { copyBrowserText, hasLocalClipboard, pasteBrowserText } from "./browser-clipboard.js";
import { writeClipboard } from "./geometry.js";
import { pasteSelection } from "./paste-selection.js";
import { clipboardSelection } from "./selection.js";

/** DOM clipboard events cover keyboard and native Edit menus without host pasteboard APIs. */
export function clipboardControls(editor: SketchEditor): () => void {
  const abort = new AbortController();
  const catalog = toolCatalog(editor);
  const reason = () =>
    editor.interactions.current ? "Finish or cancel the current edit first" : null;
  const copyText = () => {
    const geometry = clipboardSelection(editor);
    if (!geometry.sketches.length && !geometry.bodies.length)
      throw new Error("Select sketch geometry or whole bodies to copy");
    return writeClipboard(geometry);
  };
  const disposers = [
    catalog.register({
      id: "copy",
      label: "Copy",
      shortcut: "⌘C",
      category: "Document & Edit",
      showInTools: false,
      finishEdit: false,
      reason: () =>
        reason() ??
        (editor.world.active
          ? editor.selectionOwners.size
            ? null
            : "Select sketch geometry to copy"
          : editor.modeling.targets.some((t) => t.kind === "sketch" || t.kind === "profile") ||
              selectionContext(editor.modeling.targets, editor.store.data).complete.length
            ? null
            : "Select sketch geometry or whole bodies to copy"),
      run: () => copyBrowserText(copyText()),
    }),
    catalog.register({
      id: "paste",
      label: "Paste",
      shortcut: "⌘V",
      category: "Document & Edit",
      showInTools: false,
      finishEdit: false,
      reason,
      run: async () => {
        return pasteSelection(editor, await pasteBrowserText());
      },
    }),
  ];
  clipboardShortcuts(editor, abort.signal);
  window.addEventListener(
    "copy",
    (event) => {
      if (textOwnsClipboard(event) || !event.clipboardData) return;
      const unavailable = catalog.reason({ reason, finishEdit: false });
      if (unavailable) return report(unavailable);
      try {
        event.clipboardData.setData("text/plain", copyText());
        event.preventDefault();
      } catch (error) {
        report(error);
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "paste",
    (event) => {
      if (textOwnsClipboard(event) || !event.clipboardData) return;
      const text = event.clipboardData.getData("text/plain");
      event.preventDefault();
      void catalog.activate({ reason, finishEdit: false, run: () => pasteSelection(editor, text) });
    },
    { signal: abort.signal },
  );
  function report(error: unknown): void {
    editor.message = error instanceof Error ? error.message : String(error);
    editor.refresh();
  }
  return () => {
    abort.abort();
    for (const dispose of disposers) dispose();
  };
}

function textOwnsClipboard(event: Event): boolean {
  const element = event.target instanceof Element ? event.target : document.activeElement;
  return !!element?.closest(
    "input, textarea, [contenteditable]:not([contenteditable=false]), .agent-dock, dialog[open]",
  );
}

function clipboardShortcuts(editor: SketchEditor, signal: AbortSignal): void {
  for (const type of ["keydown", "keypress"] as const)
    onModelKeydown(
      (event) => {
        if (
          event.defaultPrevented ||
          textOwnsClipboard(event) ||
          !(event.metaKey || event.ctrlKey) ||
          event.altKey
        )
          return;
        const key = event.key.toLowerCase();
        const localPaste = key === "v" && !navigator.clipboard && hasLocalClipboard();
        if (key !== "c" && !localPaste) return;
        event.preventDefault();
        void toolCatalog(editor).invoke(localPaste ? "paste" : "copy");
      },
      { signal },
      type,
    );
}
