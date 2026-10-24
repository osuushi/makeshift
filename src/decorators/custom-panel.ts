import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { appendCustomDiagnostics } from "./custom-diagnostics.js";
import { gearGroupMembers } from "./gear-group.js";
import { gearFitFailure, groupEligible } from "./gear-group-geometry.js";
import { appendGearInformation, gearFieldInstances } from "./gear-panel.js";
import { appendGearPrintFields } from "./gear-print-panel.js";
import { gearDefinition, gearManifest } from "./gear-settings.js";
import { appendPresetControls } from "./preset-panel.js";
import type { DecoratorSettingsDraft } from "./settings-draft.js";
import { decoratorField } from "./settings-field.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorInstance, Settings } from "./types.js";

function button(editor: SketchEditor, root: HTMLElement, label: string, action: () => unknown) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.onclick = () =>
    void toolCatalog(editor).activate({ finishEdit: true, reason: () => null, run: action });
  root.append(element);
  return element;
}

export function appendCustomDecorators(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
  draft: DecoratorSettingsDraft,
  patch: (instances: DecoratorInstance[], settings: Settings, preview: boolean) => void,
) {
  const groups = new Map<string, DecoratorInstance[]>();
  for (const instance of instances) {
    const key = `${instance.definition}/${instance.version}/${instance.gearGroup ?? ""}`;
    const group = groups.get(key) ?? [];
    for (const member of instance.gearGroup
      ? gearGroupMembers(editor.store.data, instance)
      : [instance]) {
      if (!group.some((d) => d.id === member.id)) group.push(member);
    }
    groups.set(key, group);
  }
  for (const group of groups.values()) appendGroup(root, editor, group, draft, patch);
}
function appendGroup(
  root: HTMLElement,
  editor: SketchEditor,
  group: DecoratorInstance[],
  draft: DecoratorSettingsDraft,
  patch: (instances: DecoratorInstance[], settings: Settings, preview: boolean) => void,
): void {
  const first = group[0];
  const fresh = () =>
    (editor.store.data.decorators ?? []).filter((instance) =>
      group.some((old) => old.id === instance.id),
    );
  const definition =
    first.definition === gearDefinition
      ? gearManifest
      : editor.store.data.decoratorDefinitions?.find(
          (d) => d.id === first.definition && d.version === first.version,
        );
  const expand = () => {
    editor.modeling.targets = fresh().flatMap((d) =>
      d.faces.map((f) => ({ kind: "face" as const, ...f })),
    );
    editor.refresh();
  };
  button(editor, root, `${definition?.name ?? first.definition} · ${group.length}`, expand);
  if (first.definition === threadDefinition) return;
  if (!definition) {
    const note = document.createElement("p");
    note.textContent = "Definition unavailable. Import its bundled code to edit or export.";
    root.append(note);
  } else if (
    first.definition !== gearDefinition &&
    !editor.store.decoratorSources.some(
      (s) =>
        s.id === definition.id &&
        s.version === definition.version &&
        s.source === definition.source,
    )
  ) {
    button(editor, root, `Enable ${definition.name} code`, () => {
      return editor.store.request({
        kind: "decorator-enable",
        id: definition.id,
        version: definition.version,
        enabled: true,
      });
    });
  } else if (!group.some((d) => d.problem && !d.problem.startsWith(gearFitFailure))) {
    if (!group[0].gearGroup) appendPresetControls(root, editor, group);
    appendFields(root, editor, group, definition.fields, draft, patch);
  }

  button(
    editor,
    root,
    `Remove ${definition?.name ?? first.definition} decorator from selected faces`,
    () => {
      const selected = new Set(
        editor.modeling.targets.flatMap((t) => (t.kind === "face" ? [t.face] : [])),
      );
      return editor.store.request({
        kind: "decorator",
        edit: {
          action: "remove",
          faces: fresh().flatMap((d) => d.faces.filter((f) => selected.has(f.face))),
        },
      });
    },
  );
}

function appendFields(
  root: HTMLElement,
  editor: SketchEditor,
  group: DecoratorInstance[],
  fields: readonly import("./types.js").DecoratorField[],
  draft: DecoratorSettingsDraft,
  patch: (instances: DecoratorInstance[], settings: Settings, preview: boolean) => void,
): void {
  appendGearInformation(root, editor, group);
  for (const instance of group) {
    if (!instance.problem?.startsWith(gearFitFailure))
      appendCustomDiagnostics(root, editor, instance);
  }
  if (group[0].gearGroup && group.every((d) => groupEligible(editor.store.data, d))) {
    appendGearPrintFields(root, editor, group, draft, patch);
    return;
  }
  for (const schema of fields) {
    if (["addendum", "rootClearance"].includes(schema.key)) continue;
    if (schema.key === "preset" && schema.type === "enum") continue;
    const applicable = gearFieldInstances(editor, group, schema.key);
    if (!applicable.length) continue;
    if (
      schema.visibleWhen &&
      !group.some((d) => schema.visibleWhen?.values.includes(d.settings[schema.visibleWhen.key]))
    )
      continue;
    decoratorField(
      root,
      schema,
      applicable,
      (settings, preview) => patch(applicable, settings, preview),
      draft,
    );
  }
}
