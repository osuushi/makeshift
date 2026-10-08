import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { toolMenuOpen } from "../tools/menu-focus.js";
import { captureCamera, restoreCamera } from "./camera-state.js";
import type { DocumentCommand, DocumentHost, DocumentStatus } from "./document-host.js";
import { exportControls } from "./export-controls.js";
import { fileShortcuts } from "./file-shortcuts.js";

export function nativeFileControls(editor: SketchEditor, host: DocumentHost): () => void {
  const title = document.createElement("span");
  title.className = "document-title";
  title.setAttribute("aria-label", "Current document");
  document.querySelector("header")?.append(title);
  const disposeExport = exportControls(editor);
  const status = (value: DocumentStatus) => {
    title.textContent = `${value.name}${value.edited ? " · Edited" : ""}`;
    title.title = value.path ?? "Unsaved document";
    if (value.warning) {
      editor.message = value.warning;
      editor.refresh();
    }
  };
  const run = (command: DocumentCommand) => runDocumentCommand(editor, host, command);
  const disposeShortcuts = fileShortcuts(editor, ["new", "open", "save", "save-as", "close"]);
  const disposers = (["new", "open", "save", "save-as", "close"] as const).map((command) =>
    toolCatalog(editor).register({
      id: command,
      finishEdit: true,
      label: {
        new: "New document",
        open: "Open document",
        save: "Save document",
        "save-as": "Save document as…",
        close: "Close document",
      }[command],
      category: "Document & Edit",
      showInTools: false,
      reason: () => (command === "close" ? null : idleReason(editor)),
      run: () => run(command),
    }),
  );
  const disposeCommands = host.onCommand((command) => {
    // Native File menu and keyboard/header actions share ordinary switch acceptance.
    if (
      ["new", "open", "save", "save-as", "close"].includes(command) &&
      !(command === "close" && editor.store.scriptRunning)
    )
      void toolCatalog(editor).invoke(command);
    else if (["quit", "restart-update"].includes(command) && !editor.store.scriptRunning)
      void toolCatalog(editor).activate({ reason: () => null, run: () => run(command) });
    else void run(command);
  });
  const disposeStatus = host.onStatus(status);
  let initialized = false;
  const update = () => {
    if (!initialized && !editor.store.busy) {
      initialized = true;
      void host.status().then((value) => {
        status(value);
        restoreCamera(editor.world, value.camera);
      });
    }
  };
  editor.world.changed.add(update);
  update();
  return () => {
    disposeShortcuts();
    disposeExport();
    disposeCommands();
    disposeStatus();
    editor.world.changed.delete(update);
    for (const dispose of disposers) dispose();
    title.remove();
  };
}

async function runDocumentCommand(
  editor: SketchEditor,
  host: DocumentHost,
  command: DocumentCommand,
): Promise<void> {
  const leaving = command === "close" || command === "quit" || command === "restart-update";
  if (toolMenuOpen() && !leaving) {
    if (
      (command === "undo" || command === "redo") &&
      document.activeElement instanceof HTMLInputElement
    )
      document.execCommand(command);
    return;
  }
  if (editor.store.scriptRunning && leaving) {
    const result = await host.command(command, captureCamera(editor.world));
    if (result.error) {
      editor.message = result.error;
      editor.refresh();
    }
    return;
  }
  if (command === "undo" || command === "redo") {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.closest(".agent-dock")) return;
    if (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement) {
      document.execCommand(command);
    } else await editor.history(command);
    return;
  }
  if (editor.blocked || editor.interactions.current || editor.isDragging) return;
  editor.store.busy = true;
  editor.message = command === "open" ? "Opening document…" : "Working with document…";
  editor.refresh();
  try {
    await editor.store.settled();
    const result = await host.command(command, captureCamera(editor.world));
    if (result.error) throw new Error(result.error);
    if (result.replaced) {
      await editor.store.documentReplaced();
      editor.bodiesVisible = true;
      editor.visibility.reset();
      editor.world.crossSection = null;
      editor.selectTargets([]);
      editor.modeling.targets = [];
      editor.world.exit();
      restoreCamera(editor.world, result.camera);
      editor.notice = "";
    }
    editor.message = "";
  } catch (error) {
    editor.message = error instanceof Error ? error.message : String(error);
  } finally {
    editor.store.busy = false;
    editor.refresh();
  }
}
