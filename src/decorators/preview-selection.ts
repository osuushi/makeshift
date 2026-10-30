import type { ModelingTarget } from "../sketch/model-selection-state.js";
import { previewFaceKey } from "./preview-compositor.js";
import type { DecoratorInstance } from "./types.js";

/** Selection follows accepted supports, independently of body-wide preview occlusion. */
export function selectedPreviewSupports(
  instances: readonly Pick<DecoratorInstance, "id" | "faces">[],
  targets: readonly ModelingTarget[],
): Set<string> {
  const faces = new Set(
    targets
      .filter((target) => target.kind === "face")
      .map((target) => previewFaceKey(target.body, target.face)),
  );
  const bodies = new Set(
    targets.filter((target) => target.kind === "body").map((target) => target.body),
  );
  return new Set(
    instances
      .filter((instance) =>
        instance.faces.some(
          (face) => bodies.has(face.body) || faces.has(previewFaceKey(face.body, face.face)),
        ),
      )
      .map((instance) => instance.id),
  );
}
