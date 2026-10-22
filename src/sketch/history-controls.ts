import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { hasTouchControls } from "./touch-preference.js";
import "./history-controls.css";

/** Direct document history access for touch surfaces without a keyboard. */
export function installHistoryControls(editor: SketchEditor, app: HTMLElement): () => void {
  if (!hasTouchControls()) return () => {};
  const catalog = toolCatalog(editor);
  const group = document.createElement("div");
  group.className = "history-controls";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "History");
  const buttons = ["undo", "redo"].map((id) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = id === "undo" ? "↶ Undo" : "↷ Redo";
    button.setAttribute("aria-label", id === "undo" ? "Undo" : "Redo");
    button.onclick = () => void catalog.invoke(id);
    group.append(button);
    return { id, button };
  });
  const update = () => {
    const tools = catalog.results();
    for (const { id, button } of buttons) {
      const tool = tools.find((entry) => entry.id === id);
      button.disabled = !tool || tool.unavailable !== null;
      button.title = tool?.unavailable ?? tool?.label ?? id;
    }
  };
  app.querySelector("header .brand")?.after(group);
  editor.world.changed.add(update);
  update();
  return () => {
    editor.world.changed.delete(update);
    group.remove();
  };
}
