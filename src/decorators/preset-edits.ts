import type { SketchDocument } from "../sketch/document.js";
import { isBuiltinDecorator } from "./builtins.js";
import { choiceKey, copyPreset, localPreset, presetName, sameSettings } from "./presets.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

type Run = (document: SketchDocument, edit: DecoratorEdit) => Promise<SketchDocument>;

/** Presets are resolved settings snapshots; editing never changes other decorated parts. */
export async function editWithPresets(document: SketchDocument, edit: DecoratorEdit, run: Run) {
  if (edit.action === "preset") return editPreset(document, edit, run);
  const choice =
    edit.action === "apply" && edit.settings === undefined
      ? document.lastDecoratorChoices?.[
          choiceKey(
            edit.definition,
            edit.version ??
              Math.max(
                1,
                ...(document.decoratorDefinitions ?? [])
                  .filter((d) => d.id === edit.definition)
                  .map((d) => d.version),
              ),
          )
        ]
      : undefined;
  const resolved =
    edit.action === "apply" && choice ? { ...edit, settings: choice.settings } : edit;
  const next = await run(document, resolved);
  if (edit.action !== "apply" && edit.action !== "settings") return next;
  const presets = [...(document.decoratorPresets ?? [])];
  const last = { ...document.lastDecoratorChoices };
  const decorators = next.decorators?.map((instance) => {
    const previous = document.decorators?.find((d) => d.id === instance.id);
    if (previous === instance) return instance;
    let presetId = instance.presetId;
    if (edit.action === "apply") {
      presetId = choice?.presetId;
      if (edit.settings && Object.keys(edit.settings).some((key) => key !== "preset")) {
        const preset =
          presets.find(
            (p) =>
              p.definition === instance.definition &&
              p.version === instance.version &&
              sameSettings(p.settings, instance.settings),
          ) ?? copyPreset(presets, instance, `${presetName(instance)} copy`);
        if (!presets.some((p) => p.id === preset.id)) presets.push(preset);
        presetId = preset.id;
      }
    } else if (
      isBuiltinDecorator(instance.definition) &&
      Object.keys(edit.patch).length === 1 &&
      edit.patch.preset !== undefined
    ) {
      presetId = undefined;
    } else if (previous && !sameSettings(previous.settings, instance.settings)) {
      const existing = localPreset(document, previous);
      const shared =
        existing &&
        document.decorators?.some((d) => d.presetId === existing.id && !edit.ids.includes(d.id));
      const updated =
        existing && !shared
          ? { ...existing, settings: { ...instance.settings } }
          : copyPreset(presets, instance, `${existing?.name ?? presetName(previous)} copy`);
      const index = presets.findIndex((p) => p.id === updated.id);
      if (index < 0) presets.push(updated);
      else presets[index] = updated;
      presetId = updated.id;
    }
    last[choiceKey(instance.definition, instance.version)] = {
      settings: { ...instance.settings },
      presetId,
    };
    const result = { ...instance, presetId };
    if (presetId === undefined) delete result.presetId;
    return result;
  });
  return { ...next, decorators, decoratorPresets: presets, lastDecoratorChoices: last };
}

async function editPreset(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "preset" }>,
  run: Run,
): Promise<SketchDocument> {
  const group = document.decorators?.filter((d) => edit.ids.includes(d.id)) ?? [];
  const first = group[0];
  if (
    !first ||
    group.length !== new Set(edit.ids).size ||
    group.some((d) => d.definition !== first.definition || d.version !== first.version)
  )
    throw new Error("Select decorators of one type");
  if (edit.operation === "select") {
    const preset = document.decoratorPresets?.find(
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
    return remember(next, edit.ids, preset.id);
  }
  if (!group.every((d) => sameSettings(d.settings, first.settings)))
    throw new Error("Select decorators with matching settings");
  if (edit.operation === "rename") {
    const preset = localPreset(document, first);
    const name = edit.name?.trim();
    if (!preset) throw new Error("Duplicate the built-in preset before renaming it");
    if (group.some((d) => d.presetId !== preset.id)) throw new Error("Select one preset to rename");
    if (!name || name.length > 200) throw new Error("Enter a preset name of 1–200 characters");
    if (document.decoratorPresets?.some((p) => p.id !== preset.id && p.name === name))
      throw new Error("A preset already has this name");
    return {
      ...document,
      decoratorPresets: document.decoratorPresets?.map((p) =>
        p.id === preset.id ? { ...p, name } : p,
      ),
    };
  }
  if (edit.operation !== "duplicate") throw new Error("Unknown preset operation");
  const presets = document.decoratorPresets ?? [];
  const preset = copyPreset(
    presets,
    first,
    `${localPreset(document, first)?.name ?? presetName(first)} copy`,
  );
  return remember({ ...document, decoratorPresets: [...presets, preset] }, edit.ids, preset.id);
}

function remember(document: SketchDocument, ids: string[], presetId: string): SketchDocument {
  const last = { ...document.lastDecoratorChoices };
  const decorators = document.decorators?.map((instance): DecoratorInstance => {
    if (!ids.includes(instance.id)) return instance;
    last[choiceKey(instance.definition, instance.version)] = {
      settings: { ...instance.settings },
      presetId,
    };
    return { ...instance, presetId };
  });
  return { ...document, decorators, lastDecoratorChoices: last };
}
