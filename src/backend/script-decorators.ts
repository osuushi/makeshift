import type { DecoratorCatalog, DecoratorScriptOperation } from "../agent-script/decorators.js";
import { knurlDefinition } from "../decorators/builtins.js";
import { editDefinitions } from "../decorators/definition-edits.js";
import { editDecorators } from "../decorators/edits.js";
import { documentPresets } from "../decorators/ephemeral-presets.js";
import { gearManifest } from "../decorators/gear-settings.js";
import { knurlFields } from "../decorators/knurl-settings.js";
import { threadDefinition, threadFields } from "../decorators/thread-settings.js";
import type { SketchDocument } from "../sketch/document.js";
import type { DecoratorSession } from "./decorator-session.js";

export function decoratorCatalog(
  document: SketchDocument,
  session: DecoratorSession,
): DecoratorCatalog {
  return {
    instances: document.decorators ?? [],
    presets: documentPresets(document),
    definitions: (document.decoratorDefinitions ?? []).map((d) => ({
      ...d,
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
      session.enable(document, id, version, enabled);
      break;
    }
  }
  return { document: next, result: decoratorCatalog(next, session) };
}
