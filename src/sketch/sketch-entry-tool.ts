import type { ConstructionPlane } from "../model/construction-plane.js";
import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { onModelKeydown } from "./model-keys.js";
import { planeIds } from "./planes.js";

/** Enter sketching from the current modeling context, with a deliberate shortcut. */
export function sketchEntryTool(
  editor: SketchEditor,
  selectedConstructionPlane: () => ConstructionPlane | undefined,
): () => void {
  const catalog = toolCatalog(editor);
  const dispose = catalog.register({
    id: "start-sketch",
    label: "Sketch",
    category: "Sketch",
    shortcut: "⌘Enter",
    aliases: ["new sketch", "start sketching"],
    description: "Start sketching on the selected face or plane",
    finishEdit: false,
    reason: () =>
      editor.workspaceEntry.reason() ?? (editor.world.active ? "Already editing a sketch" : null),
    run: () => {
      const target = editor.modeling.targets.length === 1 ? editor.modeling.targets[0] : null;
      if (target?.kind === "face") {
        const face = editor.display.bodies
          ?.find((body) => body.id === target.body)
          ?.faces.find((item) => item.id === target.face);
        if (face?.plane) return editor.workspaceEntry.selected();
      }
      const constructionPlane = selectedConstructionPlane();
      if (constructionPlane)
        return editor.workspaceEntry.enter({
          key: "Construction plane",
          frame: structuredClone(constructionPlane.frame),
        });
      const selectedCanonicalPlane = editor.world.selectedPlane;
      if (selectedCanonicalPlane) return editor.workspaceEntry.canonical(selectedCanonicalPlane);
      const primary =
        planeIds.find((id) => editor.world.canonicalVisibility.states[id].role === "primary") ??
        "XY";
      return editor.workspaceEntry.canonical(primary);
    },
  });
  const abort = new AbortController();
  onModelKeydown(
    (event) => {
      if (
        event.defaultPrevented ||
        !(event.metaKey || event.ctrlKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key !== "Enter" ||
        (event.target instanceof HTMLElement &&
          (event.target.matches("input, textarea, select") || event.target.isContentEditable)) ||
        catalog.reason({ reason: () => null })
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void catalog.invoke("start-sketch");
    },
    { capture: true, signal: abort.signal },
  );
  return () => {
    abort.abort();
    dispose();
  };
}
