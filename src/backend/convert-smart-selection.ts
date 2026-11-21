import { copyRegions } from "../clipboard/sketch-regions.js";
import { guideOwner } from "../guides/types.js";
import type { SmartObjectSelection } from "../model/smart-object.js";
import { appendSelection, copySelection } from "../sketch/copy-selection.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { profilesFor } from "../sketch/profiles.js";
import { deleteEntities } from "./delete-entities.js";

export function convertSmartSelection(document: SketchDocument, selection: SmartObjectSelection) {
  const bodies = selected(document.bodies ?? [], selection.bodies);
  const sketches = selected(document.sketches, selection.sketches);
  const planes = selected(document.constructionPlanes ?? [], selection.planes ?? []);
  const objects = selected(document.smartObjects ?? [], selection.instances);
  const bodiesIds = new Set(bodies.map(({ id }) => id));
  const moved = new Set([...bodies, ...sketches, ...planes, ...objects].map(({ id }) => id));
  const details = partialSketches(document, selection);
  if (!moved.size && !details.length)
    throw new Error("Select geometry to convert into a smart object");
  const decorators = document.decorators?.flatMap((decorator) => {
    const faces = decorator.faces.filter(({ body }) => bodiesIds.has(body));
    return faces.length ? [{ ...decorator, faces }] : [];
  });
  const source: SketchDocument = {
    units: "mm",
    sketchGrid: document.sketchGrid,
    bodies,
    sketches: [...sketches, ...details.map(({ sketch }) => sketch)],
    constructionPlanes: planes,
    smartObjects: objects,
    entityPresentation: document.entityPresentation?.filter(({ id }) => moved.has(id)),
    bodyAppearances: document.bodyAppearances?.filter(({ body }) => bodiesIds.has(body)),
    taggedGroups: document.taggedGroups?.filter(({ body }) => bodiesIds.has(body)),
    guidePoints: [
      ...(document.guidePoints ?? []).filter(({ anchor }) => moved.has(guideOwner(anchor))),
      ...details.flatMap(({ guides }) => guides),
    ],
    decorators,
    decoratorDefinitions: document.decoratorDefinitions?.filter((definition) =>
      decorators?.some((d) => d.definition === definition.id && d.version === definition.version),
    ),
  };
  const remaining = deleteEntities(document, {
    kind: "delete-entities",
    bodyIds: selection.bodies,
    sketchIds: selection.sketches,
    smartObjectIds: selection.instances,
    curves: selection.curves,
    profiles: selection.profiles?.filter(({ sketch }) => !moved.has(sketch)),
  });
  const parent: SketchDocument = {
    ...remaining,
    constructionPlanes: remaining.constructionPlanes?.filter(({ id }) => !moved.has(id)),
    entityPresentation: remaining.entityPresentation?.filter(({ id }) => !moved.has(id)),
    guidePoints: remaining.guidePoints?.filter(({ anchor }) => !moved.has(guideOwner(anchor))),
  };
  return { source, parent };
}

export function selected<T extends { id: string }>(
  items: readonly T[],
  ids: readonly string[],
): T[] {
  const set = new Set(ids);
  const result = items.filter((item) => set.has(item.id));
  if (result.length !== set.size) throw new Error("Part of the selection no longer exists");
  return result;
}

function partialSketches(document: SketchDocument, selection: SmartObjectSelection) {
  const whole = new Set(selection.sketches);
  const candidates = new Set([
    ...(selection.curves ?? []).map(({ sketch }) => sketch),
    ...(selection.profiles ?? []).map(({ sketch }) => sketch),
  ]);
  return selected(document.sketches, [...candidates]).flatMap((sketch) => {
    if (whole.has(sketch.id)) return [];
    const ids = new Set(
      (selection.curves ?? []).filter((p) => p.sketch === sketch.id).flatMap((p) => p.ids),
    );
    const profiles = new Set(
      (selection.profiles ?? []).filter((p) => p.sketch === sketch.id).map((p) => p.profile),
    );
    selected(sketch.curves, [...ids]);
    if (profiles.size !== profilesFor(sketch).filter(({ key }) => profiles.has(key)).length)
      throw new Error("Select a current sketch region");
    const curveIds = new Map<string, string>();
    const copied = copySelection(sketch, ids, curveIds);
    const result = { ...appendSelection(copied, copyRegions(sketch, profiles, ids)), id: newId() };
    if (!result.curves.length) return [];
    const guides =
      document.guidePoints?.flatMap((guide) => {
        const { anchor } = guide;
        if (anchor.kind !== "sketch-curve" || anchor.sketch !== sketch.id) return [];
        const curve = curveIds.get(anchor.curve);
        return curve ? [{ ...guide, anchor: { ...anchor, sketch: result.id, curve } }] : [];
      }) ?? [];
    return [{ sketch: result, guides }];
  });
}
