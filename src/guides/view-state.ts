import type { SketchEditor } from "../sketch/editor.js";

const editing = new WeakMap<SketchEditor, { sketch?: boolean; model?: boolean }>();
const listeners = new WeakMap<SketchEditor, Set<() => void>>();
export function observeGuides(editor: SketchEditor, changed: () => void): () => void {
  const callbacks = listeners.get(editor) ?? new Set();
  listeners.set(editor, callbacks);
  callbacks.add(changed);
  return () => callbacks.delete(changed);
}
/** Each workspace remembers candidate editing; saved-guide visibility and Undo stay separate. */
export const editingGuides = (editor: SketchEditor): boolean =>
  editor.world.active
    ? (editing.get(editor)?.sketch ?? false)
    : (editing.get(editor)?.model ?? true);
export function toggleGuideEditing(editor: SketchEditor): void {
  const state = editing.get(editor) ?? {};
  state[editor.world.active ? "sketch" : "model"] = !editingGuides(editor);
  editing.set(editor, state);
  for (const changed of listeners.get(editor) ?? []) changed();
  editor.refresh();
}
