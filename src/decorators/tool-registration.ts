import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { knurlDefinition } from "./builtins.js";
import { gearFaces } from "./gear-faces.js";
import { gearDefinition } from "./gear-settings.js";
import { threadDefinition } from "./thread-settings.js";

/** Tool discovery and pitch-face eligibility; document edits stay with the panel/owner. */
export function registerDecoratorTools(
  editor: SketchEditor,
  apply: (definition: string) => Promise<void>,
  eligibility: (definition?: string) => string | null,
): () => void {
  const unregister = [
    toolCatalog(editor).register({
      id: "threads",
      finishEdit: true,
      label: "Threads",
      category: "Solid",
      aliases: ["decorate", "screw", "thread"],
      description: "Editable threads on cylindrical faces; generated at mesh export",
      reason: () => idleReason(editor) ?? eligibility(),
      run: () => apply(threadDefinition),
    }),
    toolCatalog(editor).register({
      id: "gear",
      finishEdit: true,
      label: "Gear",
      category: "Solid",
      aliases: ["involute", "helical", "teeth", "gears"],
      description: "Compatible gear groups on pitch cylinders; generated at mesh export",
      reason: () => {
        const reason = idleReason(editor);
        if (reason) return reason;
        const faces = editor.modeling.targets.flatMap((t) =>
          t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
        );
        if (editor.world.active || faces.length !== editor.modeling.targets.length)
          return "Select pitch faces in Modeling";
        try {
          gearFaces(editor.store.data, faces);
          return null;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
      run: () => apply(gearDefinition),
    }),
    toolCatalog(editor).register({
      id: "knurling",
      finishEdit: true,
      label: "Knurling",
      category: "Solid",
      aliases: ["knurl", "grip", "diamond texture"],
      description: "Editable diamond knurling on cylindrical faces; generated at mesh export",
      reason: () => idleReason(editor) ?? eligibility(knurlDefinition),
      run: () => apply(knurlDefinition),
    }),
  ];
  return () => {
    for (const dispose of unregister) dispose();
  };
}
