import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";

export function renameEntity(editor: SketchEditor, label: HTMLButtonElement, id: string): void {
  void toolCatalog(editor).activate({
    reason: () => null,
    run: () => startRename(editor, label, id),
  });
}

function startRename(editor: SketchEditor, label: HTMLButtonElement, id: string): void {
  if (editor.blocked || editor.interactions.current || !label.isConnected) return;
  const input = document.createElement("input");
  input.className = "entity-name";
  input.value = label.textContent ?? "";
  input.maxLength = 200;
  input.setAttribute("aria-label", `Name for ${input.value}`);
  let finished = false;
  const finish = async (accept: boolean) => {
    if (finished) return;
    if (accept && !input.value.trim()) {
      input.setCustomValidity("Enter a name");
      input.reportValidity();
      input.focus();
      return;
    }
    finished = true;
    if (accept && !editor.blocked && !editor.interactions.current)
      await editor.store.request({ kind: "rename-entity", id, name: input.value });
    input.replaceWith(label);
    editor.refresh();
  };
  input.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      void finish(event.key === "Enter");
    }
  };
  input.oninput = () => input.setCustomValidity("");
  input.onblur = () => void finish(true);
  label.replaceWith(input);
  input.focus();
  input.select();
}
