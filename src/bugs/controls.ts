import { bugPrebuffer, onBugPrebufferChange } from "../preferences/bug-recording.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { bugDiagnostics } from "./diagnostics.js";
import { BugSession } from "./session.js";

export function bugControls(editor: SketchEditor, parent: HTMLElement): () => void {
  if (!window.makeshiftBug) return () => {};
  const session = new BugSession(editor, parent);
  const diagnostics = bugDiagnostics(
    session.timeline,
    () => bugPrebuffer() || session.state === "starting" || session.state === "recording",
  );
  const preference = onBugPrebufferChange(() => void session.bufferChanged());
  const shortcut = (event: KeyboardEvent) => {
    const toggle =
      (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.code === "KeyB";
    if (!toggle) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat) return;
    void session.toggle();
  };
  window.addEventListener("keydown", shortcut, true);
  const tool = toolCatalog(editor).register({
    id: "bug-report",
    label: "Record bug report",
    category: "Development",
    description: "Record this window, microphone, fixtures and inputs; invoke again to save",
    shortcut: "Cmd/Ctrl+B",
    finishEdit: false,
    allowBusy: true,
    reason: () => null,
    run: () => {
      void session.toggle();
    },
  });
  const unload = () => session.dispose();
  window.addEventListener("pagehide", unload, { once: true });
  void session.bufferChanged();
  return () => {
    window.removeEventListener("keydown", shortcut, true);
    window.removeEventListener("pagehide", unload);
    diagnostics();
    preference();
    tool();
    session.dispose();
  };
}
