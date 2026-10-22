import type { SketchEditor } from "../sketch/editor.js";

const visibility = new WeakMap<SketchEditor, boolean>();
/** Per-window view state, independent of individual saved-guide visibility and Undo. */
export const guidesVisible = (editor: SketchEditor): boolean => visibility.get(editor) !== false;
export function toggleGuides(editor: SketchEditor): void {
  visibility.set(editor, !guidesVisible(editor));
  editor.refresh();
}
