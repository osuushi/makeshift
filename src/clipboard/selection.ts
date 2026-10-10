import { exactBodies } from "../model/exact-body.js";
import { selectionContext } from "../model/selection-context.js";
import { copySelection } from "../sketch/copy-selection.js";
import type { Sketch } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ClipboardGeometry } from "./geometry.js";
import { copyRegions } from "./sketch-regions.js";

export function clipboardSelection(editor: SketchEditor): ClipboardGeometry {
  const document = editor.store.data;
  const sketches: Sketch[] = [];
  if (editor.world.active) {
    const sketch = editor.sketch;
    if (sketch && editor.selectionOwners.size)
      sketches.push(copySelection(sketch, editor.selectionOwners));
  } else {
    for (const sketch of document.sketches) {
      const targets = editor.modeling.targets.filter((t) => t.sketch === sketch.id);
      if (targets.some((t) => t.kind === "sketch")) sketches.push(sketch);
      else {
        const keys = new Set(targets.flatMap((t) => (t.kind === "profile" ? [t.profile.key] : [])));
        if (!keys.size) continue;
        const copy = copyRegions(sketch, keys);
        if (copy.curves.length) sketches.push(copy);
      }
    }
  }
  const bodies = editor.world.active
    ? []
    : selectionContext(editor.modeling.targets, document).complete;
  const bodyIds = new Set(bodies.map((body) => body.id));
  const entityIds = new Set([...bodyIds, ...sketches.map((sketch) => sketch.id)]);
  const decorators = document.decorators?.flatMap((instance) => {
    const faces = instance.faces.filter((face) => bodyIds.has(face.body));
    return faces.length ? [{ ...instance, faces }] : [];
  });
  return {
    decorators,
    decoratorDefinitions: document.decoratorDefinitions?.filter((definition) =>
      decorators?.some(
        (instance) =>
          instance.definition === definition.id && instance.version === definition.version,
      ),
    ),
    sketches,
    bodies: exactBodies(bodies),
    bodyAppearances: document.bodyAppearances?.filter((entry) => bodyIds.has(entry.body)),
    taggedGroups: document.taggedGroups?.filter((group) => bodyIds.has(group.body)),
    entityPresentation: document.entityPresentation?.filter((entry) => entityIds.has(entry.id)),
  };
}
