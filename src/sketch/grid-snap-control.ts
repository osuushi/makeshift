import {
  onSketchGridPreferencesChange,
  saveSketchGridDefaults,
} from "../preferences/sketch-grid.js";
import { sketchGridFields } from "../preferences/sketch-grid-fields.js";
import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { defaultSketchGrid } from "./grid-settings.js";
import { viewOptions } from "./view-options.js";
import "./grid-controls.css";

/** Document grid and device display settings share the viewport popover. */
export function installGridSnapControl(editor: SketchEditor): () => void {
  const view = viewOptions(editor);
  const { panel, button } = view;
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
  close.onclick = view.hide;
  const note = document.createElement("p");
  note.textContent = "Sketch grid spacing, colors and snapping apply to this document's sketches.";
  panel.append(note, fields.root, save, close, feedback);
  button.onclick = (event) => {
    event.preventDefault();
    void toolCatalog(editor).invoke("sketch-grid");
  };
  const disposeTool = toolCatalog(editor).register({
    id: "sketch-grid",
    label: "View options",
    category: "View",
    finishEdit: false,
    aliases: ["grid", "grid settings", "grid snap", "snap to grid", "view settings"],
    reason: () => (editor.interactions.current ? "Finish the current gesture first" : null),
    run: () => {
      feedback.textContent = "";
      update();
      view.toggle();
    },
  });
  const update = () => {
    button.disabled = editor.blocked || !!editor.interactions.current;
    fields.root.disabled = editor.blocked || !!editor.interactions.current;
    save.disabled = editor.blocked || !!editor.interactions.current;
    fields.update();
  };
  const disposePreferences = onSketchGridPreferencesChange(() => editor.world.requestDraw());
  editor.world.changed.add(update);
  update();
  return () => {
    disposeTool();
    disposePreferences();
    editor.world.changed.delete(update);
    view.dispose();
  };
}
