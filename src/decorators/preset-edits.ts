import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator } from "./builtins.js";
import { documentPresets, ephemeralPresetId } from "./ephemeral-presets.js";
import { gearFaces } from "./gear-faces.js";
import { gearDefinition } from "./gear-settings.js";
import { editPreset, presetReference } from "./preset-actions.js";
import {
  choiceKey,
  type DecoratorPreset,
  lastDecoratorChoice,
  localPreset,
  presetName,
  recalledChoiceSettings,
  sameSettings,
} from "./presets.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export type PresetRun = (document: SketchDocument, edit: DecoratorEdit) => Promise<SketchDocument>;

/** Named presets are snapshots; edits derive unnamed presets from current instance settings. */
export async function editWithPresets(
  document: SketchDocument,
  edit: DecoratorEdit,
  run: PresetRun,
) {
  if (edit.action === "preset") return editPreset(document, edit, run);
  const choice =
    edit.action === "apply" && edit.settings === undefined
      ? lastDecoratorChoice(
          document,
          edit.definition,
          edit.version ??
            Math.max(
              1,
              ...(document.decoratorDefinitions ?? [])
                .filter((d) => d.id === edit.definition)
                .map((d) => d.version),
            ),
        )
      : undefined;
  const groupSettings =
    edit.action === "apply" && edit.settings === undefined && edit.gearGroup
      ? document.decorators?.find((d) => d.gearGroup === edit.gearGroup)?.settings
      : undefined;
  const recalled =
    groupSettings ??
    (edit.action === "apply" ? recalledChoiceSettings(edit.definition, choice) : undefined);
  const resolved =
    edit.action === "apply" && recalled
      ? { ...edit, settings: recalledSettings(document, edit, recalled) }
      : edit;
  const next = await run(document, resolved);
  if (edit.action !== "apply" && edit.action !== "settings") return next;
  const selected = documentPresets(document).find((p) => p.id === choice?.presetId);
  const last = { ...document.lastDecoratorChoices };
  const decorators = next.decorators?.map((instance) => {
    const previous = document.decorators?.find((d) => d.id === instance.id);
    if (previous === instance) return instance;
    const result = editedPreset(document, edit, instance, previous, selected);
    last[choiceKey(result.definition, result.version)] = {
      settings: { ...result.settings },
      presetId: ephemeralPresetId(result) ?? result.presetId,
    };
    return result;
  });
  return {
    ...next,
    decorators,
    decoratorPresets: next.decoratorPresets ?? [],
    lastDecoratorChoices: last,
  };
}

function editedPreset(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "apply" | "settings" }>,
  instance: DecoratorInstance,
  previous?: DecoratorInstance,
  selected?: DecoratorPreset,
): DecoratorInstance {
  if (edit.action === "apply") {
    if (selected && sameSettings(selected.settings, instance.settings))
      return presetReference(instance, selected);
    if (selected || (edit.settings && Object.keys(edit.settings).some((key) => key !== "preset")))
      return {
        ...presetReference(instance),
        presetOrigin: selected?.origin ?? selected?.name ?? presetName(instance),
      };
    return presetReference(instance);
  }
  if (
    isBuiltinDecorator(instance.definition) &&
    Object.keys(edit.patch).length === 1 &&
    edit.patch.preset !== undefined
  )
    return presetReference(instance);
  if (!previous || sameSettings(previous.settings, instance.settings)) return instance;
  return {
    ...presetReference(instance),
    presetOrigin:
      previous.presetOrigin ?? localPreset(document, previous)?.name ?? presetName(previous),
  };
}

/** Rotary count and phase are fitted to current cylinders, not recalled from another gear. */
function recalledSettings(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "apply" }>,
  settings: DecoratorInstance["settings"],
) {
  if (
    edit.definition !== gearDefinition ||
    settings.helix ||
    settings.shift ||
    !gearFaces(document, edit.faces).every((f) => !!f.cylinder)
  )
    return settings;
  return Object.fromEntries(
    Object.entries(settings).filter(([key]) => key !== "teeth" && key !== "phase"),
  );
}
