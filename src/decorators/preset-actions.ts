import { newId, type SketchDocument } from "../sketch/document.js";
import { documentPresets, ephemeralPresetId } from "./ephemeral-presets.js";
import type { PresetRun } from "./preset-edits.js";
import {
  checkedPresetName,
  choiceKey,
  copyPreset,
  type DecoratorPreset,
  localPreset,
  presetName,
  sameSettings,
} from "./presets.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

/** A reference is either a named snapshot or the origin of a computed preset. */
export function presetReference(
  instance: DecoratorInstance,
  preset?: DecoratorPreset,
): DecoratorInstance {
  const { presetId: _id, presetOrigin: _origin, ...rest } = instance;
  if (!preset) return rest;
  return preset.origin !== undefined
    ? { ...rest, presetOrigin: preset.origin }
    : { ...rest, presetId: preset.id };
}

export async function editPreset(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "preset" }>,
  run: PresetRun,
): Promise<SketchDocument> {
  const group = document.decorators?.filter((d) => edit.ids.includes(d.id)) ?? [];
  const first = group[0];
  if (
    !first ||
    group.length !== new Set(edit.ids).size ||
    group.some((d) => d.definition !== first.definition || d.version !== first.version)
  )
    throw new Error("Select decorators of one type");
  const presets = documentPresets(document);
  if (edit.operation === "select") {
    const preset = presets.find(
      (p) =>
        p.id === edit.presetId && p.definition === first.definition && p.version === first.version,
    );
    if (!preset) throw new Error("Select an existing preset for this decorator");
    const next = await run(document, {
      action: "settings",
      ids: edit.ids,
      patch: preset.settings,
      replace: true,
    });
    return remember(next, edit.ids, preset);
  }
  if (!group.every((d) => sameSettings(d.settings, first.settings)))
    throw new Error("Select decorators with matching settings");
  if (edit.operation === "rename") {
    const preset = localPreset(document, first);
    if (!preset) throw new Error("Edit or save the built-in preset before renaming it");
    if (group.some((d) => localPreset(document, d)?.id !== preset.id))
      throw new Error("Select one preset to rename");
    const name = checkedPresetName(presets, edit.name, preset.id);
    const { origin: _origin, ...snapshot } = preset;
    const saved = { ...snapshot, id: preset.origin === undefined ? preset.id : newId(), name };
    const stored = (document.decoratorPresets ?? []).filter((p) => p.id !== preset.id);
    const ids = (document.decorators ?? [])
      .filter((d) => (ephemeralPresetId(d) ?? d.presetId) === preset.id)
      .map((d) => d.id);
    return remember({ ...document, decoratorPresets: [...stored, saved] }, ids, saved);
  }
  if (edit.operation !== "duplicate") throw new Error("Unknown preset operation");
  const preset = copyPreset(
    presets,
    first,
    localPreset(document, first)?.name ?? presetName(first),
  );
  if (edit.name !== undefined) preset.name = checkedPresetName(presets, edit.name);
  return remember(
    { ...document, decoratorPresets: [...(document.decoratorPresets ?? []), preset] },
    edit.ids,
    preset,
  );
}

function remember(
  document: SketchDocument,
  ids: string[],
  preset: DecoratorPreset,
): SketchDocument {
  const last = { ...document.lastDecoratorChoices };
  const decorators = document.decorators?.map((instance): DecoratorInstance => {
    if (!ids.includes(instance.id)) return instance;
    last[choiceKey(instance.definition, instance.version)] = {
      settings: { ...instance.settings },
      presetId: preset.id,
    };
    return presetReference(instance, preset);
  });
  return { ...document, decorators, lastDecoratorChoices: last };
}
