import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { selectVisibleTools } from "./select-visible.js";
import { type Refinement, refinements, refineSelection } from "./selection-refinement.js";

export class SelectionTools {
  private disposers: (() => void)[] = [];
  constructor(private editor: SketchEditor) {
    this.disposers.push(selectVisibleTools(editor));
    for (const [action, label] of refinements)
      this.disposers.push(
        toolCatalog(editor).register({
          id: `selection-${action}`,
          finishEdit: true,
          label,
          category: "Select",
          reason: () => idleReason(editor) ?? this.reason(action),
          run: () => {
            if (action === "clear" && editor.world.active) editor.select([]);
            else
              editor.modeling.targets = refineSelection(
                editor.modeling.targets,
                editor.store.data.bodies ?? [],
                action,
              );
            if (!editor.world.active)
              for (const notify of editor.modeling.selectionChosen) notify();
            editor.modeling.hover = null;
            editor.modeling.alternatives = [];
            editor.notice = "";
            editor.refresh();
          },
        }),
      );
  }
  private reason(action: Refinement): string | null {
    const e = this.editor;
    if (e.world.active) return action === "clear" ? null : "Select solid geometry in Modeling";
    if (
      (action === "boundary" || action === "only-faces") &&
      !e.modeling.targets.some((t) => t.kind === "face" || t.kind === "body")
    )
      return "Select faces or bodies";
    if (action === "only-edges" && !e.modeling.targets.some((t) => t.kind === "edge"))
      return "Select edges";
    // A refinement that already matches the selection is an admitted no-op.
    // Otherwise the picker could never finish (e.g. Only edges after picking edges).
    return null;
  }
  dispose(): void {
    for (const dispose of this.disposers) dispose();
  }
}
