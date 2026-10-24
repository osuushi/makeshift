import { newId, type SketchDocument } from "../sketch/document.js";
import { planes } from "../sketch/planes.js";
import { isBuiltinDecorator } from "./builtins.js";
import { definitionSettings } from "./definition.js";
import { editDecorators, faceKey, validateDecorators } from "./edits.js";
import { matchGearApplication } from "./gear-group.js";
import { gearFitFailure } from "./gear-group-geometry.js";
import { gearDefinition } from "./gear-settings.js";
import { gearPlacement } from "./gear-support.js";
import type { JavaScriptDecorators } from "./javascript-hooks.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export function needsJavaScript(document: SketchDocument, edit: DecoratorEdit): boolean {
  if (edit.action === "preset") return false;
  if (edit.action === "apply") return !isBuiltinDecorator(edit.definition);
  if (edit.action === "remove" || edit.action === "discard") return false;
  const ids = edit.action === "settings" ? edit.ids : [edit.id];
  return !!document.decorators?.some(
    (d) => ids.includes(d.id) && !isBuiltinDecorator(d.definition),
  );
}

export function editJavaScriptDecorators(
  document: SketchDocument,
  edit: DecoratorEdit,
  hooks: JavaScriptDecorators,
): SketchDocument {
  const previous = document.decorators ?? [];
  let next: readonly DecoratorInstance[];
  if (edit.action === "apply") {
    next = applyJavaScriptDecorator(document, edit, hooks);
  } else if (edit.action === "settings") {
    next = patchJavaScriptSettings(document, edit, hooks);
  } else if (edit.action === "continue" || edit.action === "reassign") {
    const original = previous.find((d) => d.id === edit.id);
    if (!original) throw new Error("Select an existing decorator");
    const faces =
      edit.action === "reassign"
        ? edit.faces
        : [
            ...original.faces,
            ...edit.faces.filter((f) => !original.faces.some((old) => faceKey(old) === faceKey(f))),
          ];
    const candidate = {
      ...original,
      faces,
      problem: undefined,
      ...(edit.action === "reassign" && original.definition === gearDefinition
        ? { ...gearPlacement(document, faces), state: undefined }
        : {}),
    };
    const groups = hooks.partition(document, candidate);
    if (groups.length !== 1) throw new Error("These faces cannot continue one decorator");
    next = previous.map((d) => (d.id === original.id ? { ...candidate, ...groups[0] } : d));
  } else return editDecorators(document, edit);
  const candidate = { ...document, decorators: next };
  validateDecorators(candidate);
  for (const instance of next) {
    if (instance.problem?.startsWith(gearFitFailure)) continue;
    if (isBuiltinDecorator(instance.definition) || previous.includes(instance)) continue;
    const error = hooks.diagnostics(candidate, instance).find((d) => d.severity === "error");
    if (error) throw new Error(error.message);
  }
  return candidate;
}

function patchJavaScriptSettings(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "settings" }>,
  hooks: JavaScriptDecorators,
): readonly DecoratorInstance[] {
  const previous = document.decorators ?? [];
  let next: readonly DecoratorInstance[];
  if (!edit.ids.length || edit.ids.some((id) => !previous.some((d) => d.id === id)))
    throw new Error("Select existing decorators");
  const groups = new Set(
    previous.filter((d) => edit.ids.includes(d.id) && d.gearGroup).map((d) => d.gearGroup),
  );
  next = previous.map((instance) => {
    if (!edit.ids.includes(instance.id) && !(instance.gearGroup && groups.has(instance.gearGroup)))
      return instance;
    if (isBuiltinDecorator(instance.definition))
      return (
        editDecorators(document, { ...edit, ids: [instance.id] }).decorators?.find(
          (d) => d.id === instance.id,
        ) ?? instance
      );
    const definition = hooks.definition(document, instance.definition, instance.version);
    return {
      ...instance,
      settings: definitionSettings(
        definition,
        edit.replace ? edit.patch : { ...instance.settings, ...edit.patch },
      ),
    };
  });
  if (
    [
      "module",
      "diameterTolerance",
      "minimumTooth",
      "pressure",
      "thinning",
      "clearance",
      "rootClearance",
    ].some((key) => edit.patch[key] !== undefined)
  ) {
    for (const group of new Set(
      next.filter((d) => edit.ids.includes(d.id) && d.gearGroup).map((d) => d.gearGroup),
    )) {
      if (group) next = matchGearApplication(document, next, new Set<string>(), group, true);
    }
  }
  return next;
}

function applyJavaScriptDecorator(
  document: SketchDocument,
  edit: Extract<DecoratorEdit, { action: "apply" }>,
  hooks: JavaScriptDecorators,
): readonly DecoratorInstance[] {
  const previous = document.decorators ?? [];
  if (!edit.faces.length) throw new Error("Select faces to decorate");
  const version =
    edit.version ??
    (edit.definition === gearDefinition ? 1 : undefined) ??
    Math.max(
      ...(document.decoratorDefinitions ?? [])
        .filter((d) => d.id === edit.definition)
        .map((d) => d.version),
    );
  const definition = hooks.definition(document, edit.definition, version);
  const occupied = new Map(
    previous
      .filter((d) => !d.problem || d.problem.startsWith(gearFitFailure))
      .flatMap((d) => d.faces.map((f) => [faceKey(f), d] as const)),
  );
  if (
    edit.faces.some(
      (f) => occupied.has(faceKey(f)) && occupied.get(faceKey(f))?.definition !== definition.id,
    )
  )
    throw new Error("Remove the existing decorator before applying another");
  const faces = edit.faces.filter((f) => !occupied.has(faceKey(f)));
  if (!faces.length && edit.definition !== gearDefinition) return previous;
  const base: DecoratorInstance = {
    id: newId(),
    definition: definition.id,
    version,
    faces,
    settings: definitionSettings(definition, edit.settings ?? {}),
    frame: planes.XY,
  };
  let next: readonly DecoratorInstance[] = [
    ...previous,
    ...(faces.length
      ? hooks.partition(document, base).map((group) => ({ ...base, ...group, id: newId() }))
      : []),
  ];
  if (
    edit.definition === gearDefinition &&
    (edit.gearGroup || edit.settings?.teeth === undefined)
  ) {
    const selected = new Set(
      next
        .filter((d) => d.faces.some((f) => edit.faces.some((r) => faceKey(r) === faceKey(f))))
        .map((d) => d.id),
    );
    next = matchGearApplication(document, next, selected, edit.gearGroup);
  }
  return next;
}
