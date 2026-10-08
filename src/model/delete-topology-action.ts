import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

/** Immediate deletion; backend acceptance and the busy state cover the entire edit. */
export class DeleteTopologyAction {
  private disposeTool: () => void;
  private abort = new AbortController();
  constructor(private editor: SketchEditor) {
    this.disposeTool = toolCatalog(editor).register({
      id: "delete",
      label: "Delete",
      showInTools: false,
      category: "Document & Edit",
      shortcut: "⌫",
      aliases: ["remove geometry"],
      reason: () =>
        idleReason(editor) ??
        (editor.world.active
          ? editor.selectionOwners.size
            ? null
            : "Select sketch geometry"
          : this.selected()
            ? null
            : "Select bodies, sketches, faces or edges"),
      run: () => (editor.world.active ? editor.remove() : this.remove()),
    });
    onModelKeydown(
      (event) => {
        if (
          !["Delete", "Backspace"].includes(event.key) ||
          event.repeat ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement ||
          event.target instanceof HTMLSelectElement ||
          (event.target instanceof HTMLElement && event.target.isContentEditable) ||
          toolCatalog(editor).reason({ reason: () => null })
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void toolCatalog(editor).invoke("delete");
      },
      { capture: true, signal: this.abort.signal },
    );
  }
  private async remove(): Promise<void> {
    if (!this.available()) return;
    const editor = this.editor;
    const resolution = editor.modeling.resolve("delete");
    if (!resolution.available) return;
    const { bodyIds, sketchIds, topology } = resolution.inputs;
    if (bodyIds.length || sketchIds.length) {
      const entities = { bodyIds, sketchIds, ...(topology.length ? { topology } : {}) };
      const ok = await editor.store.request({ kind: "delete-entities", ...entities });
      if (ok) {
        editor.modeling.targets = [];
        editor.notice = "";
      }
      editor.refresh();
      return;
    }
    const selection = topology;
    const ok = await editor.store.request({ kind: "delete-topology", selection });
    if (ok) {
      const bodies = new Set(selection.map((target) => target.body));
      editor.modeling.targets = (editor.store.data.bodies ?? [])
        .filter((body) => bodies.has(body.id))
        .map((body) => ({ kind: "body", body: body.id }));
      editor.notice = "";
    }
    editor.refresh();
  }
  private available(): boolean {
    return (
      !this.editor.world.active &&
      !this.editor.blocked &&
      !this.editor.interactions.current &&
      this.selected()
    );
  }
  private selected(): boolean {
    return this.editor.modeling.resolve("delete").available;
  }
  dispose(): void {
    this.abort.abort();
    this.disposeTool();
  }
}
