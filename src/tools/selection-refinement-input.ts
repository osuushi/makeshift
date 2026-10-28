import { pickFinishTarget, refineFinishEdges } from "../model/edge-finish-refinement.js";
import type { SketchEditor } from "../sketch/editor.js";
import { pickModel } from "../sketch/model-selection.js";
import { ToolSelection } from "./tool-selection.js";

/** Modifier clicks belong to the current tool, before ordinary selection can finish it. */
export function installSelectionRefinement(editor: SketchEditor, signal: AbortSignal): void {
  for (const type of ["pointerdown", "pointerup", "click", "dblclick"] as const)
    window.addEventListener(
      type,
      (event) => {
        const lease = editor.interactions.current;
        if (
          event.target !== editor.world.canvas ||
          event.button ||
          !(event.shiftKey || event.ctrlKey || event.metaKey) ||
          (lease
            ? !lease.refineSelection || lease.captured
            : !editor.modeling.explicitTool || !!editor.world.active)
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type !== "click" || editor.blocked) return;
        if (lease?.phase === "editing") lease.refineSelection?.(event);
        else if (!lease) refineIdleSelection(editor, event);
      },
      { capture: true, signal },
    );
}

function refineIdleSelection(editor: SketchEditor, event: MouseEvent): void {
  const mode = editor.modeling.explicitTool;
  if (!mode) return;
  if (mode === "fillet" || mode === "chamfer") {
    const target = pickFinishTarget(editor, event);
    const resolved = editor.modeling.resolve(mode);
    if (!target || (!resolved.available && editor.modeling.targets.length)) return;
    const edges = refineFinishEdges(
      editor.store.data,
      resolved.available ? resolved.inputs : [],
      target,
      event.altKey,
      event.ctrlKey || event.metaKey,
    );
    if (!edges) return;
    editor.modeling.targets = edges.map((edge) => ({ kind: "edge", ...edge }));
  } else {
    const target = pickModel(editor, { x: event.clientX, y: event.clientY });
    const selection = new ToolSelection(editor, mode, () => null);
    if (!target || !selection.accepts(target)) return;
    editor.modeling.choose(target, event.shiftKey, event.ctrlKey || event.metaKey);
  }
  editor.modeling.setTool(mode);
  editor.refresh();
}
