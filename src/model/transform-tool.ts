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
      referenceSelected() ||
      scaleSelection(editor) ||
      (!editor.world.active && modelingSketch(editor)) ||
      (editor.world.active && editor.selectionOwners.size)
        ? null
        : "Select sketch, solid geometry or a plane",
    run: async () => {
      await activate();
    },
  });
}
