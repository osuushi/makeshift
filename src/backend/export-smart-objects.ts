import type { Drawing } from "../model/benches.js";
import { resolvePlacements } from "../model/smart-object.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { selected } from "./convert-smart-selection.js";
import { placeBodies } from "./materialize-smart-objects.js";
import type { SolidCalculator } from "./solid-calculator.js";

/** Build an export-only snapshot of linked base solids at their visible placements. */
export async function exportSmartObjects(
  document: SketchDocument,
  ids: readonly string[],
  drawing: Drawing,
  kernel: SolidCalculator,
): Promise<SketchDocument> {
  const roots = selected(document.smartObjects ?? [], ids);
  const sources = new Map(drawing.benches.map(({ id, document }) => [id, document]));
  const bodies = [...(document.bodies ?? [])];
  const bodyAppearances = [...(document.bodyAppearances ?? [])];
  for (const placement of resolvePlacements(roots, (id) => sources.get(id))) {
    const source = sources.get(placement.source);
    if (!source) throw new Error("The smart object's source bench is missing");
    for (const body of await placeBodies(source, placement.transform, kernel)) {
      const id = newId();
      bodies.push({ ...body, id });
      const style = source.bodyAppearances?.find((appearance) => appearance.body === body.id);
      if (style) bodyAppearances.push({ ...style, body: id });
    }
  }
  return { ...document, bodies, bodyAppearances };
}
