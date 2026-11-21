import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { BodyBoolean } from "./body.js";
import { booleanStart } from "./boolean-start.js";
import { modelingShortcutLabel } from "./modeling-shortcuts.js";
import { wholePlacements } from "./operation-selection.js";
import { placementTargets } from "./placement-selection.js";
export class BodyActions {
  private disposers: (() => void)[] = [];
  constructor(
    editor: SketchEditor,
    enable: (copy: boolean) => void,
    boolean: (mode: BodyBoolean["mode"]) => void,
    cleanup: () => void,
  ) {
    const reason = (operation: "boolean" | "cleanup") => {
      if (editor.world.active) return "Select solid geometry in Modeling";
      const resolution =
        operation === "boolean" ? booleanStart(editor) : editor.modeling.resolve(operation);
      return idleReason(editor) ?? (resolution.available ? null : resolution.reason);
    };
    const catalog = toolCatalog(editor);
    this.disposers.push(
      catalog.register({
        id: "duplicate",
        finishEdit: true,
        label: "Duplicate bodies",
        category: "Transform",
        aliases: ["copy bodies", "duplicate smart objects"],
        reason: () =>
          idleReason(editor) ??
          (editor.world.active || !wholePlacements(editor.modeling.targets, editor.store.data, true)
            ? "Select bodies or smart objects to duplicate"
            : null),
        run: () => {
          const data = editor.store.data;
          const selection = wholePlacements(editor.modeling.targets, data, true);
          if (!selection) return;
          editor.modeling.targets = placementTargets({
            ids: selection.bodies.map(({ id }) => id),
            smartObjectIds: selection.smartObjectIds,
          });
          editor.refresh();
          enable(true);
        },
      }),
    );
    for (const mode of ["union", "subtract", "intersect"] as const)
      this.disposers.push(
        catalog.register({
          id: mode,
          selectionInTool: true,
          finishEdit: true,
          label: `${mode[0].toUpperCase()}${mode.slice(1)}`,
          category: "Solid",
          shortcut: modelingShortcutLabel(mode),
          aliases:
            mode === "union"
              ? ["join", "combine", "fuse bodies"]
              : mode === "subtract"
                ? ["difference", "cut bodies"]
                : ["intersection", "common"],
          reason: () => reason("boolean"),
          run: () => boolean(mode),
        }),
      );
    this.disposers.push(
      catalog.register({
        id: "cleanup",
        finishEdit: true,
        label: "Clean up",
        category: "Solid",
        aliases: ["refine", "remove seams"],
        reason: () => reason("cleanup"),
        run: cleanup,
      }),
    );
  }
  dispose(): void {
    for (const dispose of this.disposers) dispose();
  }
}
