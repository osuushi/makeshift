import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

/** Whole-body selection includes supports; partial selection removes only its own membership. */
export function selectedDecoratorFaces(
  instances: readonly Pick<DecoratorInstance, "faces">[],
  targets: readonly ModelingTarget[],
): FaceReference[] {
  const bodies = new Set(
    targets.flatMap((target) => (target.kind === "body" ? [target.body] : [])),
  );
  const faces = new Set(
    targets.flatMap((target) => (target.kind === "face" ? [`${target.body}/${target.face}`] : [])),
  );
  const selected = new Map<string, FaceReference>();
  for (const instance of instances)
    for (const face of instance.faces) {
      const key = `${face.body}/${face.face}`;
      if (bodies.has(face.body) || faces.has(key)) selected.set(key, face);
    }
  return [...selected.values()];
}
