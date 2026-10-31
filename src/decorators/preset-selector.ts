import type { SketchDocument } from "../sketch/document.js";
import { knurlDefinition } from "./builtins.js";
import { documentPresets } from "./ephemeral-presets.js";
import { knurlFields } from "./knurl-settings.js";
import { localPreset, sameSettings } from "./presets.js";
import { threadDefinition, threadFields } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

/** One native menu for built-in choices, saved document settings and saving a copy. */
export function presetSelector(
  source: SketchDocument,
  instances: DecoratorInstance[],
  run: (edit: DecoratorEdit) => unknown,
): HTMLLabelElement {
  const first = instances[0];
  const ids = instances.map((d) => d.id);
  const matching = instances.every((d) => sameSettings(d.settings, first.settings));
  const sharedBuiltin =
    first.definition === threadDefinition &&
    first.settings.preset !== "custom" &&
    instances.every(
      (d) => !d.presetId && !d.presetOrigin && d.settings.preset === first.settings.preset,
    );
  const sharedPreset = matching || sharedBuiltin;
  const firstPreset = localPreset(source, first);
  const local =
    matching && instances.every((d) => localPreset(source, d)?.id === firstPreset?.id)
      ? firstPreset
      : undefined;
  const fields =
    first.definition === threadDefinition
      ? threadFields
      : first.definition === knurlDefinition
        ? knurlFields
        : source.decoratorDefinitions?.find(
            (d) => d.id === first.definition && d.version === first.version,
          )?.fields;
  const global = fields?.find((f) => f.key === "preset" && f.type === "enum");
  const label = document.createElement("label");
  label.textContent = "Preset";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Preset");
  if (!sharedPreset || !global)
    select.append(new Option(sharedPreset ? "Current settings" : "Mixed settings", ""));
  if (global) {
    const group = document.createElement("optgroup");
    group.label = "Global";
    for (const option of global.options ?? []) group.append(new Option(option.label, option.value));
    select.append(group);
  }
  const saved = document.createElement("optgroup");
  saved.label = "Document";
  for (const preset of documentPresets(source)) {
    if (preset.definition === first.definition && preset.version === first.version)
      saved.append(new Option(preset.name, preset.id));
  }
  if (saved.children.length) select.append(saved);
  const actions = document.createElement("optgroup");
  actions.label = "Actions";
  const save = new Option("Save as document preset…", "::save");
  save.disabled = !matching;
  actions.append(save);
  if (local && matching) actions.append(new Option("Rename…", "::rename"));
  select.append(actions);
  const original = sharedPreset
    ? (local?.id ?? (global ? String(first.settings.preset ?? global.default ?? "") : ""))
    : "";
  select.value = original;
  select.onchange = async () => {
    const value = select.value;
    select.value = original;
    if (!value) return;
    const edit: DecoratorEdit =
      value === "::save" || value === "::rename"
        ? { action: "preset", operation: value === "::save" ? "duplicate" : "rename", ids }
        : Array.from(saved.children).some((option) => (option as HTMLOptionElement).value === value)
          ? { action: "preset", operation: "select", ids, presetId: value }
          : { action: "settings", ids, patch: { preset: value } };
    if ((await run(edit)) === false) select.value = original;
  };
  label.append(select);
  return label;
}
