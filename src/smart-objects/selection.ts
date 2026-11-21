import { selectionContext } from "../model/selection-context.js";
import type { SmartObjectSelection } from "../model/smart-object.js";
import type { SketchEditor } from "../sketch/editor.js";

export function selectedObjects(editor: SketchEditor) {
  const objects = editor.store.data.smartObjects;
  if (!objects?.length) return [];
  const byId = new Map(objects.map((object) => [object.id, object]));
  return editor.modeling.targets.flatMap((target) =>
    target.kind === "smart-object" ? (byId.get(target.instance) ?? []) : [],
  );
}

export function conversionSelection(editor: SketchEditor): SmartObjectSelection | null {
  if (editor.world.active) {
    const sketch = editor.sketch;
    return sketch && editor.selectedCurves.size > 0
      ? {
          bodies: [],
          sketches: [],
          instances: [],
          curves: [{ sketch: sketch.id, ids: [...editor.selectedCurves] }],
        }
      : null;
  }
  const targets = editor.modeling.targets;
  const { owners, complete, valid } = selectionContext(targets, editor.store.data);
  if (!valid || owners.length !== complete.length) return null;
  const plane = editor.workspaceEntry.selectedConstructionPlane()?.id;
  if (!targets.length && !plane) return null;
  return {
    bodies: complete.map(({ id }) => id),
    instances: targets.flatMap((target) =>
      target.kind === "smart-object" ? [target.instance] : [],
    ),
    sketches: targets.flatMap((target) =>
      target.kind === "sketch" && !target.curves ? [target.sketch] : [],
    ),
    curves: targets.flatMap((target) =>
      target.kind === "sketch" && target.curves
        ? [{ sketch: target.sketch, ids: target.curves }]
        : [],
    ),
    profiles: targets.flatMap((target) =>
      target.kind === "profile" ? [{ sketch: target.sketch, profile: target.profile.key }] : [],
    ),
    planes: plane ? [plane] : undefined,
  };
}
