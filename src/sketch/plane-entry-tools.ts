import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { planeIds } from "./planes.js";

/** Keyboard/screen-reader plane entry lives in the tool menu, not floating labels. */
export function planeEntryTools(editor: SketchEditor): () => void {
  const disposers = planeIds.map((id) =>
    toolCatalog(editor).register({
      id: `sketch-${id.toLowerCase()}`,
      finishEdit: true,
      label: `Sketch on ${id}`,
      category: "Sketch",
      reason: () => editor.workspaceEntry.reason(),
      run: () => editor.workspaceEntry.canonical(id),
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}
