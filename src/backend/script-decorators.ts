import { decoratorSummary, frameSummary } from "../agent/inspection-fields.js";
import type { DecoratorCatalog, DecoratorScriptOperation } from "../agent-script/decorators.js";
import { knurlDefinition } from "../decorators/builtins.js";
import { editDefinitions } from "../decorators/definition-edits.js";
import { editDecorators } from "../decorators/edits.js";
import { documentPresets } from "../decorators/ephemeral-presets.js";
import { gearManifest } from "../decorators/gear-settings.js";
import { knurlFields } from "../decorators/knurl-settings.js";
import { threadDefinition, threadFields } from "../decorators/thread-settings.js";
import { base64 } from "../security/signatures.js";
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
// The model's computed preset IDs contain serialized settings. Scripts receive an opaque ID
// that resolves to the same preset when used in a subsequent select operation.
async function scriptPresets(document: SketchDocument) {
  return Promise.all(
    documentPresets(document).map(async (preset) => {
      const id =
        preset.origin === undefined && !preset.id.startsWith("computed:")
          ? preset.id
          : "computed:" +
            base64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(preset.id)));
      return { id, preset };
    }),
  );
}

async function decoratorCatalog(
  document: SketchDocument,
  session: DecoratorSession,
): Promise<DecoratorCatalog> {
  const presets = await scriptPresets(document);
  const presetIds = new Map(presets.map(({ id, preset }) => [preset.id, id]));
  return {
    instances: (document.decorators ?? []).map((d) => ({
      ...decoratorSummary(d),
      frame: frameSummary(d.frame),
      settings: summarizeSettings(d.settings),
      display: d.display,
      axialReference: d.axialReference,
      presetId: d.presetId ? presetIds.get(d.presetId) : undefined,
      gearGroup: d.gearGroup,
      gearPitchRadius: d.gearPitchRadius,
      ...(d.problem ? { problem: safeName(d.problem, "Invalid decorator") } : {}),
    })),
    presets: presets.map(({ id, preset: { name, definition, version, settings } }) => ({
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
    case "editDecorator": {
      let edit = operation.input;
      if (
        edit.action === "preset" &&
        edit.operation === "select" &&
        edit.presetId?.startsWith("computed:")
      ) {
        const id = edit.presetId;
        const match = (await scriptPresets(document)).find((p) => p.id === id);
        if (!match) throw new Error("Select an existing preset for this decorator");
        edit = { ...edit, presetId: match.preset.id };
      }
      next =
        (await session.edit(document, { kind: "decorator", edit })) ??
        editDecorators(document, edit);
      break;
    }
    case "editDecoratorDefinition":
      next = editDefinitions(document, operation.input);
      break;
    case "enableDecorator": {
      const { id, version, enabled } = operation.input;
      await session.enable(document, id, version, enabled);
      break;
    }
  }
  return { document: next, result: await decoratorCatalog(next, session) };
}
