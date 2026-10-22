import type { SketchEditor } from "../sketch/editor.js";

const visibility = new WeakMap<SketchEditor, boolean>();
const listeners = new WeakMap<SketchEditor, Set<() => void>>();
export function observeGuides(editor: SketchEditor, changed: () => void): () => void {
  const callbacks = listeners.get(editor) ?? new Set();
  listeners.set(editor, callbacks);
  callbacks.add(changed);
  return () => callbacks.delete(changed);
}
/** Per-window view state, independent of individual saved-guide visibility and Undo. */
export const guidesVisible = (editor: SketchEditor): boolean => visibility.get(editor) !== false;
export function toggleGuides(editor: SketchEditor): void {
  visibility.set(editor, !guidesVisible(editor));
  for (const changed of listeners.get(editor) ?? []) changed();
  editor.refresh();
}
