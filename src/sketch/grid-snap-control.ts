import {
  onSketchGridPreferencesChange,
  saveSketchGridDefaults,
} from "../preferences/sketch-grid.js";
import { sketchGridFields } from "../preferences/sketch-grid-fields.js";
import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { defaultSketchGrid } from "./grid-settings.js";
import "./grid-controls.css";

/** Grid is a slide-out setting, never a drawing tool. */
export function installGridSnapControl(editor: SketchEditor): () => void {
  const panel = document.createElement("section");
  panel.className = "sketch-grid-panel";
  panel.id = "sketch-grid-panel";
  panel.hidden = true;
  panel.setAttribute("aria-label", "Sketch grid controls");
  const read = () => editor.store.data.sketchGrid ?? { ...defaultSketchGrid };
  const fields = sketchGridFields(read, (grid) => {
    feedback.textContent = "";
    void editor.store.request({ kind: "sketch-grid", grid }).then(() => {
      fields.update();
    });
  });
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Set default";
  save.onclick = async () => {
    await editor.store.settled();
    saveSketchGridDefaults(read());
    feedback.textContent = "Default saved for new documents.";
  };
  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Done";
  const hide = () => {
    panel.hidden = true;
    update();
    document.querySelector<HTMLButtonElement>('.toolbox [data-tool="sketch-grid"]')?.focus();
  };
  close.onclick = hide;
  panel.append(fields.root, save, close, feedback);
  editor.world.host.append(panel);
  const disposeTool = toolCatalog(editor).register({
    id: "sketch-grid",
    label: "Grid",
    category: "View",
    finishEdit: false,
    aliases: ["grid settings", "grid snap", "snap to grid"],
    reason: () =>
      !editor.world.active
        ? "Enter sketch mode"
        : editor.interactions.current
          ? "Finish the current gesture first"
          : null,
    run: () => {
      panel.hidden = !panel.hidden;
      feedback.textContent = "";
      update();
      if (!panel.hidden) panel.querySelector<HTMLInputElement>("input")?.focus();
    },
  });
  const update = () => {
    if (!editor.world.active) panel.hidden = true;
    fields.root.disabled = editor.blocked || !!editor.interactions.current;
    save.disabled = !!editor.interactions.current || editor.store.scriptRunning;
    fields.update();
    const button = document.querySelector<HTMLButtonElement>('.toolbox [data-tool="sketch-grid"]');
    button?.setAttribute("aria-expanded", String(!panel.hidden));
    button?.setAttribute("aria-controls", panel.id);
    if (!panel.hidden && button) {
      const bounds = button.closest(".toolbox")?.getBoundingClientRect();
      if (!bounds) return;
      panel.style.left = `${Math.max(8, Math.min(bounds.right + 8, window.innerWidth - 288))}px`;
      panel.style.top = `${Math.max(8, Math.min(bounds.top, window.innerHeight - panel.offsetHeight - 8))}px`;
    }
  };
  const onEscape = (event: KeyboardEvent) => {
    if (!panel.hidden && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      hide();
    }
  };
  window.addEventListener("keydown", onEscape, true);
  const disposePreferences = onSketchGridPreferencesChange(() => editor.world.requestDraw());
  editor.world.changed.add(update);
  update();
  return () => {
    disposeTool();
    disposePreferences();
    window.removeEventListener("keydown", onEscape, true);
    editor.world.changed.delete(update);
    panel.remove();
  };
}
