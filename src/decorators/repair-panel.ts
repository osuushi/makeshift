import type { DisplayDocument } from "../model/display-document.js";
import { entityRows } from "../model/entity-presentation.js";
import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { inspectorIcon } from "../tools/inspector-icons.js";
import { gearFitFailure } from "./gear-group-geometry.js";
import { gearDefinition } from "./gear-settings.js";
import { selectDecoratorInputs } from "./selection-action.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance, FaceReference } from "./types.js";

function faceSurvives(document: DisplayDocument, ref: FaceReference): boolean {
  return !!document.bodies
    ?.find((body) => body.id === ref.body)
    ?.faces.some((face) => face.id === ref.face);
}

export function needsDecoratorRepair(document: DisplayDocument, instance: DecoratorInstance) {
  return (
    !!instance.problem &&
    !instance.problem.startsWith(gearFitFailure) &&
    (instance.definition !== threadDefinition ||
      !instance.faces.some((ref) => faceSurvives(document, ref)))
  );
}

export function appendDecoratorRepairs(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
  expanded: Set<string>,
): void {
  const edit = (edit: DecoratorEdit) => editor.store.request({ kind: "decorator", edit });
  const button = (parent: HTMLElement, label: string, action: () => unknown) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.onclick = () =>
      void toolCatalog(editor).activate({ finishEdit: true, reason: () => null, run: action });
    parent.append(element);
    return element;
  };
  for (const instance of instances) {
    const item = repairDetails(editor, instance, expanded);
    root.append(item);
    const text = document.createElement("p");
    text.textContent = instance.problem ?? "Threads need attention";
    item.append(text);
    button(item, "Select affected geometry", () => {
      const current = editor.store.data.decorators?.find((d) => d.id === instance.id);
      if (!current) throw new Error("The decorator is no longer present");
      const faces = current.faces.filter((ref) => faceSurvives(editor.store.data, ref));
      editor.modeling.targets = faces.length
        ? faces.map((f) => ({ kind: "face", ...f }))
        : [...new Set(current.faces.map((f) => f.body))].map((body) => ({ kind: "body", body }));
      editor.refresh();
    });
    const thread = instance.definition === threadDefinition;
    const label = thread
      ? "Use selected faces for these threads"
      : "Use selected faces for this decorator";
    const reassign = button(item, label, () => {});
    reassign.disabled = editor.store.busy;
    reassign.onclick = () =>
      void selectDecoratorInputs(
        editor,
        label,
        async (faces) =>
          (
            await editor.store.inspectDecorator({
              definition: instance.definition,
              version: instance.version,
              faces,
              instanceId: instance.id,
              reassign: true,
            })
          ).reason,
        (faces) => edit({ action: "reassign", id: instance.id, faces }),
      );
    button(
      item,
      thread ? "Remove unresolved thread decorator" : "Remove unresolved decorator",
      () => {
        return edit({ action: "discard", id: instance.id });
      },
    );
  }
}

function repairDetails(
  editor: SketchEditor,
  instance: DecoratorInstance,
  expanded: Set<string>,
): HTMLDetailsElement {
  const item = document.createElement("details");
  item.className = "decorator-repair";
  item.open = expanded.has(instance.id);
  const definition = editor.store.data.decoratorDefinitions?.find(
    (d) => d.id === instance.definition,
  );
  const name =
    instance.definition === threadDefinition
      ? "Threads"
      : instance.definition === gearDefinition
        ? "Gear"
        : (definition?.name ?? "Decorator");
  const rows = entityRows(
    editor.store.data,
    (editor.store.data.bodies ?? []).map((b) => b.id),
    "Body",
  );
  const bodies = [...new Set(instance.faces.map((face) => face.body))];
  const owner = rows.find((row) => row.id === bodies[0])?.name ?? "Missing body";
  const summary = document.createElement("summary");
  summary.textContent = `${name} · ${owner}${bodies.length > 1 ? ` +${bodies.length - 1}` : ""} · needs attention`;
  summary.prepend(inspectorIcon("chevron"));
  item.append(summary);
  item.ontoggle = () => {
    if (!item.isConnected) return;
    if (item.open) expanded.add(instance.id);
    else expanded.delete(instance.id);
  };
  return item;
}
