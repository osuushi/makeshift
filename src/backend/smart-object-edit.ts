import { composeAffine, identityAffine, requireAffine } from "../model/affine.js";
import type { SmartObject, SmartObjectEdit } from "../model/smart-object.js";
import { newId } from "../sketch/document.js";
import type { HistoryOperation } from "../sketch/operation-history.js";
import { convertSmartSelection, selected } from "./convert-smart-selection.js";
import type { DrawingBenches } from "./drawing-benches.js";
import { materializeSmartObjects } from "./materialize-smart-objects.js";
import type { SolidCalculator } from "./solid-calculator.js";

const placement = (source: string): SmartObject => ({
  id: newId(),
  source,
  transform: identityAffine,
});

/** All linked edits run in the owner's ordinary edit slot. */
export async function editSmartObjects(
  benches: DrawingBenches,
  kernel: SolidCalculator,
  edit: SmartObjectEdit,
  operation: HistoryOperation,
  checkCancellation: () => void,
): Promise<void> {
  const document = benches.store.data;
  const objects = document.smartObjects ?? [];
  const accept = (smartObjects: readonly SmartObject[]) =>
    benches.store.accept({ ...document, smartObjects }, operation);
  switch (edit.action) {
    case "insert":
      accept([...objects, placement(edit.source)]);
      return;
    case "transform": {
      requireAffine(edit.transform);
      const affected = new Set(selected(objects, edit.ids));
      const placed = (object: SmartObject) => ({
        ...object,
        transform: edit.absolute ? edit.transform : composeAffine(edit.transform, object.transform),
        id: edit.duplicate ? newId() : object.id,
      });
      accept(
        edit.duplicate
          ? [...objects, ...[...affected].map(placed)]
          : objects.map((object) => (affected.has(object) ? placed(object) : object)),
      );
      return;
    }
    case "convert": {
      const { source, parent } = convertSmartSelection(document, edit.selection);
      benches.convert(
        source,
        (id) => ({ ...parent, smartObjects: [...(parent.smartObjects ?? []), placement(id)] }),
        operation,
      );
      return;
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
