import type { SketchEditor } from "../sketch/editor.js";
import { appendCustomDiagnostics } from "./custom-diagnostics.js";
import { appendGearInformation, gearFieldInstances } from "./gear-panel.js";
import { gearDefinition, gearManifest } from "./gear-settings.js";
import type { DecoratorSettingsDraft } from "./settings-draft.js";
import { decoratorField } from "./settings-field.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorInstance, Settings } from "./types.js";

function button(root: HTMLElement, label: string, action: () => void) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.onclick = action;
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
    const key = `${instance.definition}/${instance.version}`;
    const group = groups.get(key) ?? [];
    group.push(instance);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const definition =
      first.definition === gearDefinition
        ? gearManifest
        : editor.store.data.decoratorDefinitions?.find(
            (d) => d.id === first.definition && d.version === first.version,
          );
    const expand = () => {
      editor.modeling.targets = group.flatMap((d) =>
        d.faces.map((f) => ({ kind: "face" as const, ...f })),
      );
      editor.refresh();
    };
    button(root, `${definition?.name ?? first.definition} · ${group.length}`, expand);
    if (first.definition === threadDefinition) continue;
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
      button(root, `Enable ${definition.name} code`, () => {
        void editor.store.request({
          kind: "decorator-enable",
          id: definition.id,
          version: definition.version,
          enabled: true,
        });
      });
    } else if (!group.some((d) => d.problem)) {
      appendGearInformation(root, editor, group);
      for (const instance of group) appendCustomDiagnostics(root, editor, instance);
      for (const schema of definition.fields) {
        const applicable = gearFieldInstances(editor, group, schema.key);
        if (!applicable.length) continue;
        if (
          schema.visibleWhen &&
          !group.some((d) =>
            schema.visibleWhen?.values.includes(d.settings[schema.visibleWhen.key]),
          )
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
    button(
      root,
      `Remove ${definition?.name ?? first.definition} decorator from selected faces`,
      () => {
        const selected = new Set(
          editor.modeling.targets.flatMap((t) => (t.kind === "face" ? [t.face] : [])),
        );
        void editor.store.request({
          kind: "decorator",
          edit: {
            action: "remove",
            faces: group.flatMap((d) => d.faces.filter((f) => selected.has(f.face))),
          },
        });
      },
    );
  }
}
