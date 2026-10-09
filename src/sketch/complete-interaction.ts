import { waitForCalculation } from "./calculation-wait.js";
import type { SketchEditor } from "./editor.js";

/** Resolve temporary work through its ordinary controller, never a bare backend Accept. */
export async function completeInteraction(editor: SketchEditor): Promise<boolean> {
  const current = editor.interactions.current;
  if (!current) return !editor.blocked;
  if (current.captured || current.phase === "closing" || editor.store.scriptRunning) return false;
  if (!(await settleInteraction(editor))) return !editor.interactions.current && !editor.blocked;
  if (editor.interactions.current !== current)
    return !editor.interactions.current && !editor.blocked;
  let finished = false;
  try {
    finished = (await current.finish?.()) ?? false;
  } catch (error) {
    editor.message = error instanceof Error ? error.message : String(error);
  }
  if (!finished && editor.interactions.current === current) await editor.interactions.cancel();
  return !editor.interactions.current && !editor.blocked;
}

export async function settleInteraction(editor: SketchEditor): Promise<boolean> {
  const current = editor.interactions.current;
  if (!current) return !editor.blocked;
  if (current.captured || current.phase === "closing" || editor.store.scriptRunning) return false;
  let ready = false;
  try {
    const calculation = current.settled?.() ?? editor.store.settled();
    ready = await waitForCalculation(calculation);
  } catch (error) {
    editor.message = error instanceof Error ? error.message : String(error);
  }
  if (!ready) {
    if (editor.interactions.current === current) await editor.interactions.cancel();
    return !editor.interactions.current && !editor.blocked;
  }
  // Released gestures can start their automatic acceptance as calculation ends.
  // Join that transition before admitting the user's requested action.
  if (editor.interactions.current === current) await current.whenClosed();
  if (editor.interactions.current !== current)
    return !editor.interactions.current && !editor.blocked;
  return !editor.blocked || current.phase === "waiting";
}
