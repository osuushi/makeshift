import { decoratorSummary, frameSummary } from "../agent/inspection-fields.js";
import type { DecoratorCatalog, DecoratorScriptOperation } from "../agent-script/decorators.js";
import { knurlDefinition } from "../decorators/builtins.js";
import { editDefinitions } from "../decorators/definition-edits.js";
import { editDecorators } from "../decorators/edits.js";
import { documentPresets } from "../decorators/ephemeral-presets.js";
import { gearManifest } from "../decorators/gear-settings.js";
import { knurlFields } from "../decorators/knurl-settings.js";
import { threadDefinition, threadFields } from "../decorators/thread-settings.js";
import { safeName } from "../security/text.js";
import type { SketchDocument } from "../sketch/document.js";
import type { DecoratorSession } from "./decorator-session.js";

function summarizeSettings(settings: import("../decorators/types.js").Settings) {
  return Object.fromEntries(
    Object.entries(settings)
      .slice(0, 64)
      .filter(([key]) => /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key))
      .flatMap(([key, v]) =>
        typeof v === "string" || typeof v === "number" || typeof v === "boolean"
          ? [[key, typeof v === "string" ? safeName(v, "") : v]]
          : [],
      ),
  );
}
export function decoratorCatalog(
  document: SketchDocument,
  session: DecoratorSession,
): DecoratorCatalog {
  return {
    instances: (document.decorators ?? []).map((d) => ({
      ...decoratorSummary(d),
      frame: frameSummary(d.frame),
      settings: summarizeSettings(d.settings),
      display: d.display,
      axialReference: d.axialReference,
      presetId: d.presetId ? safeName(d.presetId, "") : undefined,
      gearGroup: d.gearGroup ? safeName(d.gearGroup, "") : undefined,
      gearPitchRadius: d.gearPitchRadius,
      ...(d.problem ? { problem: safeName(d.problem, "Invalid decorator") } : {}),
    })),
    presets: documentPresets(document).map(({ id, name, definition, version, settings }) => ({
      id,
      name: safeName(name, "Preset"),
      definition,
      version,
      settings: summarizeSettings(settings),
    })),
    definitions: (document.decoratorDefinitions ?? []).map((d) => ({
      id: d.id,
      name: safeName(d.name, "Decorator"),
      version: d.version,
      fields: d.fields.map(
        ({ key, type, label, default: value, unit, min, max, options, visibleWhen }) => ({
          key,
          type,
          label: safeName(label, key),
          ...(value !== undefined
            ? { default: typeof value === "string" ? safeName(value, "") : value }
            : {}),
          ...(unit ? { unit: safeName(unit, "") } : {}),
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {}),
          ...(type === "enum" && options
            ? {
                options: options.map((o) => ({
                  value: safeName(o.value, ""),
                  label: safeName(o.label, ""),
                })),
              }
            : {}),
          ...(visibleWhen
            ? {
                visibleWhen: {
                  key: visibleWhen.key,
                  values: visibleWhen.values.map((v) =>
                    typeof v === "string" ? safeName(v, "") : v,
                  ),
                },
              }
            : {}),
        }),
      ),
      preview: d.preview,
      livePreview: d.livePreview,
      ...(d.dependencies
        ? {
            dependencies: {
              continuation: d.dependencies.continuation,
              preview: d.dependencies.preview,
            },
          }
        : {}),
      enabled: session.sources.some(
        (s) => s.id === d.id && s.version === d.version && s.source === d.source,
      ),
    })),
    builtins: [
      { id: threadDefinition, version: 1, name: "Threads", fields: threadFields },
      gearManifest,
      { id: knurlDefinition, version: 1, name: "Knurling", fields: knurlFields },
    ],
  };
}

export async function scriptDecorator(
  document: SketchDocument,
  operation: DecoratorScriptOperation,
  session: DecoratorSession,
) {
  let next = document;
  switch (operation.kind) {
    case "inspectDecorator":
      return { document, result: await session.inspect(document, operation.input) };
    case "editDecorator":
      next =
        (await session.edit(document, { kind: "decorator", edit: operation.input })) ??
        editDecorators(document, operation.input);
      break;
    case "editDecoratorDefinition":
      next = editDefinitions(document, operation.input);
      break;
    case "enableDecorator": {
      const { id, version, enabled } = operation.input;
      await session.enable(document, id, version, enabled);
      break;
    }
  }
  return { document: next, result: decoratorCatalog(next, session) };
}
