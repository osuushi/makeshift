import { fixtureSnapshot } from "../model/fixture-snapshot.js";
import type { SketchEditor } from "../sketch/editor.js";

/** Copy visible state now; a blocked backend must not prevent saving the recording. */
export async function bugFixture(editor: SketchEditor) {
  const snapshot = structuredClone(fixtureSnapshot(editor));
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const unavailable = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error("History query timed out after 3 seconds")),
        3000,
      );
    });
    const history = await Promise.race([editor.store.history(false), unavailable]);
    return { ...snapshot, history };
  } catch (error) {
    return { ...snapshot, historyError: String(error) };
  } finally {
    clearTimeout(timeout);
  }
}
