import type { SketchEditor } from "../sketch/editor.js";
import { gearManifest } from "./gear-settings.js";
import { inspectGear } from "./gear-support.js";
import type { DecoratorSettingsDraft } from "./settings-draft.js";
import { decoratorField } from "./settings-field.js";
import type { DecoratorInstance, Settings } from "./types.js";

/** Counts, pressure and tooth depth belong to the fit; the user specifies print limits. */
export function appendGearPrintFields(
  root: HTMLElement,
  editor: SketchEditor,
  group: DecoratorInstance[],
  draft: DecoratorSettingsDraft,
  patch: (instances: DecoratorInstance[], settings: Settings, preview: boolean) => void,
) {
  const labels: Record<string, string> = {
    minimumTooth: "Minimum printable width",
    thinning: "Tooth clearance per gear",
    rootClearance: "Tooth root clearance",
    diameterTolerance: "Pitch diameter tolerance",
  };
  for (const [key, label] of Object.entries(labels)) {
    const field = gearManifest.fields.find((f) => f.key === key);
    if (!field) continue;
    const instances =
      key === "rootClearance"
        ? group.map((g) => ({
            ...g,
            settings: {
              ...g.settings,
              rootClearance:
                Number(g.settings.rootClearance ?? -1) < 0
                  ? inspectGear(editor.store.data, g).normalModule * Number(g.settings.clearance)
                  : g.settings.rootClearance,
            },
          }))
        : group;
    decoratorField(
      root,
      { ...field, label, min: key === "rootClearance" ? 0 : field.min },
      instances,
      (settings, preview) => patch(group, settings, preview),
      draft,
    );
  }
  const hint = document.createElement("p");
  hint.textContent =
    "Width protects tooth tips and ring walls. Tooth clearance applies to each gear; the pair’s clearance is their sum.";
  root.append(hint);
}
