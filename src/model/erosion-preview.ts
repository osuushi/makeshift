import type { SketchDocument } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { BodyErosion } from "./body.js";
import { defaultBodyAppearance } from "./body-appearance.js";

/** Source ghosting belongs to the temporary view, never accepted appearances. */
export function erosionPreview(
  candidate: SketchDocument,
  original: SketchDocument,
  operation: BodyErosion,
) {
  const accepted = new Set(original.bodies?.map((body) => body.id));
  const count = candidate.bodies?.filter((body) => !accepted.has(body.id)).length ?? 0;
  return {
    count,
    document: operation.keepOriginals
      ? {
          ...candidate,
          bodyAppearances: [
            ...(candidate.bodyAppearances ?? []).filter(
              (entry) => !operation.ids.includes(entry.body),
            ),
            ...operation.ids.map((body) => ({
              body,
              ...(candidate.bodyAppearances?.find((entry) => entry.body === body) ??
                defaultBodyAppearance),
              alpha: 0.15,
            })),
          ],
        }
      : candidate,
  };
}

/** Accepted result selection and source visibility are window state, like preview ghosting. */
export function selectErosionResult(
  editor: SketchEditor,
  operation: BodyErosion,
  original: ModelingTarget[],
  previous: ReadonlySet<string>,
): void {
  const copies = editor.store.data.bodies?.filter((body) => !previous.has(body.id)) ?? [];
  if (copies.length && operation.keepOriginals) {
    for (const id of operation.ids) editor.visibility.hide(id);
    for (const body of copies) editor.visibility.show(body.id);
  }
  editor.modeling.targets = copies.length
    ? copies.map((body) => ({ kind: "body", body: body.id }))
    : original.filter(
        (target) =>
          "body" in target && editor.store.data.bodies?.some((body) => body.id === target.body),
      );
}
