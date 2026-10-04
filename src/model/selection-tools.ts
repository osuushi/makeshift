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
    if (e.world.active)
      return action === "clear" && e.selectionOwners.size
        ? null
        : "Select solid geometry in Modeling";
    if (
      (action === "boundary" || action === "only-faces") &&
      !e.modeling.targets.some((t) => t.kind === "face" || t.kind === "body")
    )
      return "Select faces or bodies";
    if (action === "only-edges" && !e.modeling.targets.some((t) => t.kind === "edge"))
      return "Select edges";
    const next = refineSelection(e.modeling.targets, e.store.data.bodies ?? [], action);
    return JSON.stringify(next) === JSON.stringify(e.modeling.targets)
      ? "Would not change the current selection"
      : null;
  }
  dispose(): void {
    for (const dispose of this.disposers) dispose();
  }
}
