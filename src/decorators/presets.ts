import { newId, type SketchDocument } from "../sketch/document.js";
import { knurlDefinition } from "./builtins.js";
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
  return document.decoratorPresets?.find(
    (p) =>
      p.id === instance.presetId &&
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
  name = name.slice(0, 180);
  let unique = name;
  for (let suffix = 2; presets.some((p) => p.name === unique); suffix++)
    unique = `${name} ${suffix}`;
  return {
    id: newId(),
    name: unique,
    definition: instance.definition,
    version: instance.version,
    settings: { ...instance.settings },
  };
}
export function validatePresets(document: SketchDocument): void {
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
