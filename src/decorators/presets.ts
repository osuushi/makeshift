import { newId, type SketchDocument } from "../sketch/document.js";
import { knurlDefinition } from "./builtins.js";
import { documentPresets, ephemeralPresetId } from "./ephemeral-presets.js";
import { gearDefinition } from "./gear-settings.js";
import { threadDefinition, threadFields } from "./thread-settings.js";
import type { DecoratorInstance, Settings } from "./types.js";

export interface DecoratorChoice {
  settings: Settings;
  presetId?: string;
}
export interface DecoratorPreset extends DecoratorChoice {
  id: string;
  name: string;
  definition: string;
  version: number;
  /** Present only on computed, unnamed presets; Rename promotes them to stored snapshots. */
  origin?: string;
}
/** Recall live computed presets and saved snapshots, never an expired computed choice. */
export function lastDecoratorChoice(document: SketchDocument, definition: string, version = 1) {
  const choice = document.lastDecoratorChoices?.[choiceKey(definition, version)];
  if (!choice) return undefined;
  if (choice.presetId) {
    const preset = documentPresets(document).find(
      (p) => p.id === choice.presetId && p.definition === definition && p.version === version,
    );
    return preset ? { settings: preset.settings, presetId: preset.id } : undefined;
  }
  if (
    choice.settings.preset === "custom" &&
    !document.decorators?.some(
      (d) =>
        d.definition === definition &&
        d.version === version &&
        sameSettings(d.settings, choice.settings),
    )
  )
    return undefined;
  return choice;
}
/** Built-in thread taper defaults belong to the new support, not the last rod/hole. */
export function recalledChoiceSettings(
  definition: string,
  choice?: DecoratorChoice,
): Settings | undefined {
  if (!choice) return undefined;
  if (definition !== threadDefinition || choice.presetId || choice.settings.preset === "custom")
    return choice.settings;
  return Object.fromEntries(
    Object.entries(choice.settings).filter(([key]) => key !== "startTaper" && key !== "endTaper"),
  );
}
export const choiceKey = (definition: string, version = 1) => `${definition}/${version}`;
export function sameSettings(a: Settings, b: Settings): boolean {
  return (
    Object.keys(a).length === Object.keys(b).length &&
    Object.keys(a).every((key) => a[key] === b[key])
  );
}
export function presetName(instance: DecoratorInstance): string {
  if (instance.definition === threadDefinition)
    return (
      threadFields[0].options?.find((p) => p.value === instance.settings.preset)?.label ?? "Threads"
    );
  if (instance.definition === knurlDefinition)
    return instance.settings.preset === "coarse" ? "Coarse knurling" : "Fine knurling";
  return instance.definition === gearDefinition ? "Gear" : "Decorator";
}
export function localPreset(document: SketchDocument, instance: DecoratorInstance) {
  const id = ephemeralPresetId(instance) ?? instance.presetId;
  return documentPresets(document).find(
    (p) =>
      p.id === id &&
      p.definition === instance.definition &&
      p.version === instance.version &&
      sameSettings(p.settings, instance.settings),
  );
}
export function copyPreset(
  presets: readonly DecoratorPreset[],
  instance: DecoratorInstance,
  name: string,
): DecoratorPreset {
  return {
    id: newId(),
    name: presetCopyName(presets, name),
    definition: instance.definition,
    version: instance.version,
    settings: { ...instance.settings },
  };
}
export function presetCopyName(presets: readonly DecoratorPreset[], name: string): string {
  const base = name.replace(/(?: copy(?: \d+)?)+$/, "").slice(0, 180);
  let unique = `${base} copy`;
  for (let suffix = 2; presets.some((p) => p.name === unique); suffix++)
    unique = `${base} copy ${suffix}`;
  return unique;
}
export function checkedPresetName(
  presets: readonly DecoratorPreset[],
  name: string | undefined,
  exceptId?: string,
): string {
  name = name?.trim();
  if (!name || name.length > 200) throw new Error("Enter a preset name of 1–200 characters");
  if (presets.some((p) => p.id !== exceptId && p.name === name))
    throw new Error("A preset already has this name");
  return name;
}
export function validatePresets(document: SketchDocument): void {
  for (const instance of document.decorators ?? [])
    if (
      instance.presetOrigin !== undefined &&
      (typeof instance.presetOrigin !== "string" ||
        !instance.presetOrigin.trim() ||
        instance.presetOrigin.length > 200 ||
        instance.presetId !== undefined)
    )
      throw new Error("Invalid decorator preset origin");
  const presets = document.decoratorPresets ?? [];
  if (!Array.isArray(presets)) throw new Error("Invalid decorator presets");
  const ids = new Set<string>();
  for (const preset of presets) {
    if (
      !preset ||
      typeof preset.id !== "string" ||
      !preset.id ||
      ids.has(preset.id) ||
      typeof preset.name !== "string" ||
      !preset.name.trim() ||
      preset.name.length > 200 ||
      typeof preset.definition !== "string" ||
      !preset.definition ||
      !Number.isInteger(preset.version) ||
      preset.version < 1
    )
      throw new Error("Invalid decorator preset");
    ids.add(preset.id);
    validateChoice(preset);
  }
  if (document.lastDecoratorChoices !== undefined) {
    if (
      !document.lastDecoratorChoices ||
      typeof document.lastDecoratorChoices !== "object" ||
      Array.isArray(document.lastDecoratorChoices)
    )
      throw new Error("Invalid decorator choices");
    for (const choice of Object.values(document.lastDecoratorChoices)) validateChoice(choice);
  }
}
function validateChoice(choice: DecoratorChoice): void {
  if (
    !choice?.settings ||
    typeof choice.settings !== "object" ||
    Array.isArray(choice.settings) ||
    (choice.presetId !== undefined && typeof choice.presetId !== "string") ||
    Object.values(choice.settings).some(
      (v) =>
        !["string", "number", "boolean"].includes(typeof v) ||
        (typeof v === "number" && !Number.isFinite(v)),
    )
  )
    throw new Error("Invalid decorator preset settings");
}
