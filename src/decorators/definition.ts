import type { DecoratorField, Settings } from "./types.js";

export const maxDecoratorSource = 256 * 1024;
export type GeometryDependency = "faces" | "adjacent-faces" | "bodies";
export interface DecoratorDefinition {
  id: string;
  version: number;
  name: string;
  source: string;
  fields: readonly DecoratorField[];
  preview?: boolean;
  livePreview?: boolean;
  /** Opt-in promises about geometry read by each hook; omitted scopes stay conservative. */
  dependencies?: { continuation?: GeometryDependency; preview?: GeometryDependency };
}
export type DefinitionEdit =
  | { action: "install"; definition: DecoratorDefinition }
  | { action: "remove"; id: string; version: number };

export function definitionSettings(definition: DecoratorDefinition, input: Settings): Settings {
  const settings: Settings = {};
  for (const field of definition.fields as readonly DecoratorField[]) {
    const value = input[field.key] ?? field.default;
    if (field.type === "number") {
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < (field.min ?? -Infinity) ||
        value > (field.max ?? Infinity)
      )
        throw new Error(`Invalid ${definition.name} ${field.label}`);
    } else if (typeof value !== "string" || !field.options?.some((o) => o.value === value))
      throw new Error(`Invalid ${definition.name} ${field.label}`);
    settings[field.key] = value as string | number;
  }
  if (Object.keys(input).some((key) => !definition.fields.some((f) => f.key === key)))
    throw new Error(`Unknown ${definition.name} setting`);
  return settings;
}

export function validateDefinition(definition: DecoratorDefinition): void {
  if (
    !definition ||
    typeof definition.id !== "string" ||
    !/^[a-zA-Z][a-zA-Z0-9._-]{0,99}$/.test(definition.id) ||
    definition.id.startsWith("freac.") ||
    !Number.isSafeInteger(definition.version) ||
    definition.version < 1 ||
    typeof definition.name !== "string" ||
    !definition.name.trim() ||
    definition.name.length > 100 ||
    typeof definition.source !== "string" ||
    !definition.source.trim() ||
    definition.source.length > maxDecoratorSource ||
    (definition.preview !== undefined && typeof definition.preview !== "boolean") ||
    (definition.livePreview !== undefined && typeof definition.livePreview !== "boolean") ||
    (definition.livePreview === true && definition.preview !== true) ||
    !validDependencies(definition.dependencies) ||
    !Array.isArray(definition.fields) ||
    definition.fields.length > 32
  )
    throw new Error("Invalid decorator definition");
  const keys = new Set<string>();
  for (const field of definition.fields as readonly DecoratorField[]) {
    if (
      !field ||
      typeof field.key !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(field.key) ||
      keys.has(field.key) ||
      typeof field.label !== "string" ||
      !field.label.trim() ||
      field.label.length > 100 ||
      !["number", "enum"].includes(field.type) ||
      (field.unit !== undefined && (typeof field.unit !== "string" || field.unit.length > 24)) ||
      [field.min, field.max].some(
        (n) => n !== undefined && (typeof n !== "number" || !Number.isFinite(n)),
      ) ||
      (field.min ?? -Infinity) > (field.max ?? Infinity)
    )
      throw new Error("Invalid decorator settings schema");
    keys.add(field.key);
    if (
      field.type === "enum" &&
      (!Array.isArray(field.options) ||
        !field.options.length ||
        field.options.length > 64 ||
        field.options.some(
          (o) =>
            !o ||
            typeof o.value !== "string" ||
            o.value.length > 100 ||
            typeof o.label !== "string" ||
            o.label.length > 100,
        ) ||
        new Set(field.options.map((o) => o.value)).size !== field.options.length)
    )
      throw new Error("Invalid decorator enum options");
  }
  for (const field of definition.fields as readonly DecoratorField[]) {
    const condition = field.visibleWhen;
    if (
      condition !== undefined &&
      (!condition ||
        !keys.has(condition.key) ||
        !Array.isArray(condition.values) ||
        !condition.values.length ||
        condition.values.length > 64 ||
        condition.values.some(
          (v) =>
            !["string", "number", "boolean"].includes(typeof v) ||
            (typeof v === "number" && !Number.isFinite(v)),
        ))
    )
      throw new Error("Invalid decorator field condition");
  }
  definitionSettings(definition, {});
}

function validDependencies(value: DecoratorDefinition["dependencies"]): boolean {
  return (
    value === undefined ||
    (!!value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.entries(value).every(
        ([key, scope]) =>
          ["continuation", "preview"].includes(key) &&
          ["faces", "adjacent-faces", "bodies"].includes(scope),
      ))
  );
}
