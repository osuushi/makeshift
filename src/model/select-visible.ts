import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

type Scope = "entities" | "bodies" | "sketches";

/** Bulk selection follows view visibility, including isolation and global body hiding. */
export function visibleTargets(editor: SketchEditor, scope: Scope): ModelingTarget[] {
  const data = editor.store.data;
  return [
    ...(scope !== "sketches" && editor.bodiesVisible
      ? (data.bodies ?? [])
          .filter((body) => editor.visibility.visible(body.id))
          .map((body): ModelingTarget => ({ kind: "body", body: body.id }))
      : []),
    ...(scope !== "bodies"
      ? data.sketches
          .filter((sketch) => editor.visibility.visible(sketch.id))
          .map((sketch): ModelingTarget => ({ kind: "sketch", sketch: sketch.id }))
      : []),
  ];
}

export function selectVisibleTools(editor: SketchEditor): () => void {
  const disposers = (
    [
      ["entities", "Select all visible entities", "⌘A", ["select all"]],
      ["bodies", "Select all visible bodies", "⇧⌘A", ["select all bodies"]],
      ["sketches", "Select all visible sketches", "⌥⌘A", ["select all sketches"]],
    ] as const
  ).map(([scope, label, shortcut, aliases]) =>
    toolCatalog(editor).register({
      id: `select-all-${scope}`,
      finishEdit: true,
      label,
      shortcut,
      aliases,
      category: "Select",
      showInTools: scope !== "entities",
      description:
        scope === "entities"
          ? "Select visible bodies and sketches, or all curves in the active sketch"
          : `Select whole visible ${scope} in Modeling`,
      reason: () => idleReason(editor),
      run: () => {
        if (scope === "entities" && editor.world.active) {
          editor.tool = "select";
          editor.creationArmed = false;
          editor.select(editor.sketch?.curves.map((curve) => curve.id) ?? []);
          editor.modeling.targets = [];
        } else {
          const targets = visibleTargets(editor, scope);
          editor.world.exit();
          editor.select([]);
          editor.modeling.targets = targets;
          editor.world.selectedPlane = null;
        }
        editor.modeling.hover = null;
        editor.modeling.alternatives = [];
        editor.overlaps = null;
        editor.notice = "";
        editor.refresh();
      },
    }),
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}
