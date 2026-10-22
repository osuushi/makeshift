import type { SketchEditor } from "../sketch/editor.js";
import { resolveFaces } from "./cylinder.js";
import { knurlDimensions, knurlFields, knurlSettings } from "./knurl-settings.js";
import type { DecoratorSettingsDraft } from "./settings-draft.js";
import { decoratorField } from "./settings-field.js";
import type { DecoratorInstance, Settings } from "./types.js";

export function appendKnurlSettings(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
  draft: DecoratorSettingsDraft,
  patch: (settings: Settings, preview: boolean) => void,
): void {
  if (!instances.some((d) => d.problem)) {
    for (const field of knurlFields) {
      if (field.key !== "preset") decoratorField(root, field, instances, patch, draft);
    }
    const note = document.createElement("p");
    note.textContent =
      "Diamond pattern with flat tops. Recessed preserves the original envelope; raised adds material. Fine assumes a 0.4 mm nozzle, Coarse a 0.6 mm nozzle; both assume an upright cylinder and 0.2 mm layers. Print a sample for your material and orientation.";
    root.append(note);
    for (const instance of instances) {
      const cylinder = resolveFaces(editor.store.data.bodies ?? [], instance.faces)[0].cylinder;
      const { repeats, pitch } = knurlDimensions(cylinder.radius, knurlSettings(instance.settings));
      const dimensions = document.createElement("p");
      dimensions.textContent = `${repeats} repeats · ${pitch.toFixed(3)} mm actual spacing (closes the seam)`;
      root.append(dimensions);
    }
  }
}
