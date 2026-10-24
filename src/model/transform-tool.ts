import type { SketchEditor } from "../sketch/editor.js";
import { onModelKeydown } from "../sketch/model-keys.js";
import { modelingSketch } from "../sketch/model-selection.js";
import { toolCatalog } from "../tools/catalog.js";
import { selectionPolicies } from "../tools/selection-policy.js";
import { scaleSelection } from "./scale-selection.js";
import { type TransformLayer, transformLayerState } from "./transform-layers.js";

export function registerTransformTool(
  editor: SketchEditor,
  activate: () => void | Promise<void>,
  referenceSelected: () => boolean = () => false,
): () => void {
  const catalog = toolCatalog(editor),
    abort = new AbortController();
  const selected = () => {
    if (!editor.interactions.current) transformLayerState(editor).enter("move");
  };
  editor.modeling.selectionChosen.add(selected);
  const reason = () =>
    referenceSelected() ||
    scaleSelection(editor) ||
    (!editor.world.active && modelingSketch(editor)) ||
    (editor.world.active && editor.selectionOwners.size)
      ? null
      : "Select sketch, solid geometry or a plane";
  const disposers = (["transform", "move", "rotate", "scale"] as const).map((id) =>
    catalog.register({
      id,
      finishEdit: true,
      label: id[0].toUpperCase() + id.slice(1),
      category: "Transform",
      shortcut: id === "transform" ? "⌘T" : id === "move" ? "M" : undefined,
      aliases:
        id === "move" ? ["translate"] : id === "scale" ? ["resize", "non-uniform scale"] : [],
      selection: selectionPolicies.transform,
      reason,
      run: async () => {
        transformLayerState(editor).enter(id === "transform" ? undefined : (id as TransformLayer));
        editor.transformAxis = null;
        editor.transformRotation = false;
        await activate();
      },
    }),
  );
  onModelKeydown(
    (event) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "t" ||
        (event.target instanceof Element &&
          event.target.closest("input, textarea, [contenteditable]"))
      )
        return;
      event.preventDefault();
      void catalog.invoke("transform");
    },
    { signal: abort.signal },
  );
  return () => {
    abort.abort();
    editor.modeling.selectionChosen.delete(selected);
    for (const dispose of disposers) dispose();
  };
}
