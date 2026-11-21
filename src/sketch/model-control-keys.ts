import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";

export function installModelControlKeys(
  editor: SketchEditor,
  clearPlacement: () => void,
  options: AddEventListenerOptions,
): void {
  const tools = toolCatalog(editor);
  onModelKeydown((event) => {
    if (
      editor.world.active ||
      tools.switching ||
      event.target instanceof HTMLInputElement ||
      editor.interactions.current?.captured
    )
      return;
    const [target] = editor.modeling.targets;
    if (
      event.key === "Enter" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.defaultPrevented &&
      !editor.interactions.current &&
      editor.modeling.targets.length === 1 &&
      (target?.kind === "sketch" || target?.kind === "smart-object") &&
      (!(event.target instanceof HTMLButtonElement) ||
        event.target.classList.contains("entity-label")) &&
      !(event.target instanceof HTMLSelectElement) &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      void tools.invoke(target.kind === "sketch" ? "edit-sketch" : "edit-smart-object");
    }
    if (event.key === "Escape") {
      // An operation owns its cancellation. Otherwise clear the modeling selection.
      if (editor.interactions.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        editor.interactions.requestCancel();
        return;
      }
      clearPlacement();
      editor.modeling.targets = [];
      editor.refresh();
    }
  }, options);
}
