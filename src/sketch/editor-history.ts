import type { SketchEditor } from "./editor.js";

export async function performHistory(
  editor: SketchEditor,
  direction: "undo" | "redo",
): Promise<void> {
  if (editor.world.navigation.dragging) return;
  const interaction = editor.interactions.current;
  if (interaction?.history) {
    if (interaction.captured || editor.blocked) return;
    if (direction === "undo" && !interaction.history.canUndo) await editor.interactions.cancel();
    else await interaction.history.navigate(direction);
    editor.refresh();
    return;
  }
  if (
    (interaction?.finish && !interaction.cancelBeforeHistory) ||
    editor.blocked ||
    editor.isDragging
  )
    return;
  editor.selectionHistory.finishNavigation();
  editor.numeric.cancel();
  await editor.interactions.cancel();
  await editor.store.settled();
  await editor.store.request({ kind: direction });
  editor.pivot = null;
  editor.overlaps = null;
  editor.activeHandle = undefined;
  editor.refresh();
}
