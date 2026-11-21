import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { type ModelingTarget, modelingKey } from "../sketch/model-selection-state.js";
import type { BodyTransform } from "./body.js";

export type PlacementIds = Pick<BodyTransform, "ids" | "smartObjectIds">;

export function placementKey({ ids, smartObjectIds }: PlacementIds): string {
  return [...ids, ...(smartObjectIds ?? [])].sort().join(",");
}

export function placementLabel({ ids, smartObjectIds }: PlacementIds): string {
  if (!smartObjectIds?.length) return "body";
  return ids.length ? "selection" : "smart object";
}

export function placementTargets({ ids, smartObjectIds = [] }: PlacementIds): ModelingTarget[] {
  return [
    ...ids.map((body) => ({ kind: "body" as const, body })),
    ...smartObjectIds.map((instance) => ({ kind: "smart-object" as const, instance })),
  ];
}

export function placedTargets(
  before: SketchDocument,
  after: SketchDocument,
  placement: PlacementIds,
  duplicate: boolean,
): ModelingTarget[] {
  if (!duplicate) return placementTargets(placement);
  const { ids, smartObjectIds } = placement;
  const bodyIds = ids.length
    ? (after.bodies ?? [])
        .filter(({ id }) => !before.bodies?.some((b) => b.id === id))
        .map(({ id }) => id)
    : ids;
  const links = smartObjectIds?.length
    ? (after.smartObjects ?? [])
        .filter(({ id }) => !before.smartObjects?.some((b) => b.id === id))
        .map(({ id }) => id)
    : (smartObjectIds ?? []);
  return placementTargets({ ids: bodyIds, smartObjectIds: links });
}

export async function acceptPlacement(
  editor: SketchEditor,
  edit: BodyTransform,
): Promise<string | undefined> {
  const before = editor.store.data;
  if (!(await editor.store.request({ kind: "transform-bodies", transform: edit })))
    return undefined;
  const targets = placedTargets(before, editor.store.data, edit, edit.duplicate);
  editor.modeling.targets = targets;
  return targets.map(modelingKey).sort().join(",");
}
