import { type Affine, identityAffine, translationAffine } from "../model/affine.js";
import {
  type SmartObject,
  type SmartObjectEdit,
  transformSmartObjects,
} from "../model/smart-object.js";
import { newId } from "../sketch/document.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import type { Vector } from "../sketch/planes.js";
import { convertSmartSelection, selected } from "./convert-smart-selection.js";
import type { DrawingBenches } from "./drawing-benches.js";
import { materializeSmartObjects } from "./materialize-smart-objects.js";
import { rebaseSmartSelection } from "./rebase-smart-selection.js";
import type { SolidCalculator } from "./solid-calculator.js";

const placement = (source: string, transform: Affine = identityAffine): SmartObject => ({
  id: newId(),
  source,
  transform,
});

/** All linked edits run in the owner's ordinary edit slot. */
export async function editSmartObjects(
  benches: DrawingBenches,
  kernel: SolidCalculator,
  edit: SmartObjectEdit,
  operation: HistoryOperation,
  checkCancellation: () => void,
): Promise<Vector | undefined> {
  const document = benches.store.data;
  const objects = document.smartObjects ?? [];
  const accept = (smartObjects: readonly SmartObject[]) =>
    benches.store.accept({ ...document, smartObjects }, operation);
  switch (edit.action) {
    case "insert":
      accept([...objects, placement(edit.source)]);
      return;
    case "transform":
      benches.store.accept(transformSmartObjects(document, edit, newId), operation);
      return;
    case "convert": {
      const { source, parent } = convertSmartSelection(document, edit.selection);
      const rebased = await rebaseSmartSelection(source, (id) => benches.document(id), kernel);
      checkCancellation();
      benches.convert(
        rebased.document,
        (id) => ({
          ...parent,
          smartObjects: [
            ...(parent.smartObjects ?? []),
            placement(id, translationAffine(rebased.origin)),
          ],
        }),
        operation,
      );
      return rebased.origin;
    }
    case "enter":
    case "source": {
      const object = selected(objects, [edit.id])[0];
      if (edit.action === "enter") benches.enter(object);
      else benches.focus(object.source);
      return;
    }
    case "exit":
      benches.exit();
      return;
    case "detach": {
      const removing = new Set(selected(objects, edit.ids));
      const next = await materializeSmartObjects(
        { ...document, smartObjects: objects.filter((object) => !removing.has(object)) },
        [...removing],
        (source) => benches.document(source),
        kernel,
        checkCancellation,
      );
      checkCancellation();
      benches.store.accept(next, operation);
      return;
    }
    default:
      throw new Error("Unknown smart object command");
  }
}
