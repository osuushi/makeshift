import type { SketchEditor } from "../sketch/editor.js";
import { modelingSketch } from "../sketch/model-selection.js";
import { toolCatalog } from "../tools/catalog.js";
import { scaleSelection } from "./scale-selection.js";

export function registerTransformTool(
  editor: SketchEditor,
  activate: () => void | Promise<void>,
  referenceSelected: () => boolean = () => false,
): () => void {
  return toolCatalog(editor).register({
    id: "transform",
    finishEdit: true,
    label: "Transform",
    category: "Transform",
    shortcut: "M",
    aliases: ["move", "translate", "rotate", "resize", "scale", "non-uniform scale"],
    reason: () =>
      (editor.interactions.current && !editor.interactions.current.finish
        ? "Finish or cancel the current edit first"
        : null) ??
      (referenceSelected() ||
      scaleSelection(editor) ||
      (!editor.world.active && modelingSketch(editor)) ||
      (editor.world.active && editor.selectionOwners.size)
        ? null
        : "Select sketch, solid geometry or a plane"),
    run: async () => {
      const current = editor.interactions.current;
      if (current && !(await current.finish?.())) {
        editor.message ||= "Finish or cancel the current edit before switching tools";
        return false;
      }
      await activate();
    },
  });
}
