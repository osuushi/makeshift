import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { saveFixture } from "./fixture-host.js";
import { fixtureResult } from "./fixture-result.js";
import { fixtureSnapshot } from "./fixture-snapshot.js";

/** Capture accepted and temporary geometry without finishing or cancelling the tool. */
export function fixtureControls(editor: SketchEditor, toolbar: HTMLElement): () => void {
  let capturing = false;
  const result = fixtureResult(toolbar);
  const capture = async () => {
    if (editor.blocked || capturing) return;
    capturing = true;
    const snapshot = fixtureSnapshot(editor);
    try {
      const history = await editor.store.history();
      const saved = await saveFixture({ ...snapshot, history });
      result.show(saved);
    } catch (error) {
      editor.message = `Fixture capture failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      capturing = false;
      editor.refresh();
    }
  };
  const dispose = toolCatalog(editor).register({
    id: "capture",
    finishEdit: false,
    label: "Capture fixture",
    category: "Development",
    description: "Save accepted geometry, previews and diagnostics without changing the model",
    reason: () => (capturing ? "Capturing fixture…" : null),
    run: capture,
  });
  return () => {
    dispose();
    result.dispose();
  };
}
