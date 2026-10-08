import type { SketchEditor, Tool } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "./catalog.js";

export function sketchTools(editor: SketchEditor): () => void {
  const catalog = toolCatalog(editor);
  const disposers: (() => void)[] = [];
  for (const [id, label, shortcut, aliases] of [
    ["select", "Select", "V", ["pointer"]],
    ["rectangle", "Rectangle", "R", ["box"]],
    ["line", "Line", "L", ["segment"]],
    ["circle", "Circle", "C", ["disk"]],
    ["bezier", "Curve", "B", ["bezier", "cubic curve", "spline"]],
    ["pen", "Pen", "P", ["pen tool", "path"]],
    ["trim", "Trim", "T", ["cut curve", "trim brush"]],
  ] as const)
    disposers.push(
      catalog.register({
        id,
        finishEdit: true,
        label,
        shortcut,
        aliases,
        category: id === "select" ? "Select" : "Sketch",
        description: drawingDescription(id),
        reason: () => (editor.interactions.current?.kind === "numeric" ? null : idleReason(editor)),
        run: () => editor.setTool(id),
      }),
    );
  for (const id of ["undo", "redo"] as const)
    disposers.push(
      catalog.register({
        id,
        finishEdit: false,
        label: id === "undo" ? "Undo" : "Redo",
        showInTools: false,
        category: "Document & Edit",
        shortcut: id === "undo" ? "⌘Z" : "⇧⌘Z",
        allowBusy: true,
        reason: () => {
          if (editor.world.navigation.dragging) return "Finish the current view gesture first";
          const interaction = editor.interactions.current;
          if (id === "undo" ? editor.store.canUndoView : editor.store.canRedoView) return null;
          if (interaction?.finish && !interaction.history && !interaction.cancelBeforeHistory)
            return null;
          if (interaction?.history && id === "undo") return null;
          const history = interaction?.history ?? editor.store;
          return (id === "undo" ? history.canUndo : history.canRedo) ? null : `Nothing to ${id}`;
        },
        run: () => editor.history(id),
      }),
    );
  disposers.push(
    catalog.register({
      id: "grid",
      finishEdit: () => editor.interactions.current?.kind !== "pen",
      label: "Toggle grid snapping",
      category: "View",
      aliases: ["grid snap"],
      reason: () => (editor.interactions.current?.kind === "pen" ? null : idleReason(editor)),
      run: () => {
        editor.gridSnap = !editor.gridSnap;
        editor.refresh();
      },
    }),
    catalog.register({
      id: "modeling",
      finishEdit: true,
      label: "Return to Modeling",
      category: "View",
      aliases: ["exit sketch", "3d"],
      reason: () => (!editor.world.active ? "Already in Modeling" : idleReason(editor)),
      run: async () => {
        await editor.numeric.commit();
        editor.world.exit();
      },
    }),
    catalog.register({
      id: "clear-sketch",
      label: "Clear sketch",
      category: "Document & Edit",
      reason: () =>
        idleReason(editor) ??
        (!editor.sketch?.curves.length ? "Open a sketch containing curves" : null),
      run: () => editor.clear(),
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function drawingDescription(tool: Tool): string {
  if (tool === "select") return "Select geometry";
  if (tool === "trim") return "Remove spans; hold Option and drag to brush trim";
  if (tool === "pen")
    return "Click corners, drag smooth anchors; Option breaks handles, Shift locks direction";
  return "Draw or edit in a planar workspace";
}
