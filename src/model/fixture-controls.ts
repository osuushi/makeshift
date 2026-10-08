import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { saveFixture } from "./fixture-host.js";
import { fixtureResult } from "./fixture-result.js";

/** Capture accepted and temporary geometry without finishing or cancelling the tool. */
export function fixtureControls(editor: SketchEditor, toolbar: HTMLElement): () => void {
  let capturing = false;
  const result = fixtureResult(toolbar);
  const capture = async () => {
    if (editor.blocked || capturing) return;
    capturing = true;
    const snapshot = {
      document: editor.store.data,
      preview: editor.candidate,
      backendCandidate: editor.store.candidate,
      lastEdit: editor.store.lastEdit,
      measurements: {
        offsetDistance: editor.store.offsetDistance,
        edgeSize: editor.store.edgeSize,
      },
      error: editor.message,
      notice: editor.notice,
      interaction: editor.interactions.current
        ? {
            kind: editor.interactions.current.kind,
            phase: editor.interactions.current.phase,
          }
        : null,
      modelingSelection: editor.modeling.targets,
      sketchSelection: editor.selected.targets,
      activePlane: editor.world.activeFrame,
      tool: editor.tool,
      hiddenEntities: editor.visibility.hiddenIds(editor.store.data),
      camera: {
        position: editor.world.camera.position.toArray(),
        up: editor.world.camera.up.toArray(),
        target: editor.world.target.toArray(),
        height: editor.world.height,
      },
    };
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
