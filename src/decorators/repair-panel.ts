import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { selectDecoratorInputs } from "./selection-action.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export function appendDecoratorRepairs(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
): void {
  const edit = (edit: DecoratorEdit) => editor.store.request({ kind: "decorator", edit });
  const button = (label: string, action: () => unknown) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.onclick = () =>
      void toolCatalog(editor).activate({ finishEdit: true, reason: () => null, run: action });
    root.append(element);
    return element;
  };
  for (const instance of instances) {
    const text = document.createElement("p");
    text.textContent = instance.problem ?? "Threads need attention";
    root.append(text);
    button("Select affected geometry", () => {
      const current = editor.store.data.decorators?.find((d) => d.id === instance.id);
      if (!current) throw new Error("The decorator is no longer present");
      const faces = current.faces.filter((f) =>
        editor.store.data.bodies?.some(
          (b) => b.id === f.body && b.faces.some((face) => face.id === f.face),
        ),
      );
      editor.modeling.targets = faces.length
        ? faces.map((f) => ({ kind: "face", ...f }))
        : [...new Set(current.faces.map((f) => f.body))].map((body) => ({ kind: "body", body }));
      editor.refresh();
    });
    const custom = instance.definition !== threadDefinition;
    const label = custom
      ? "Use selected faces for this decorator"
      : "Use selected faces for these threads";
    const reassign = button(label, () => {});
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
    button(custom ? "Remove unresolved decorator" : "Remove unresolved thread decorator", () => {
      return edit({ action: "discard", id: instance.id });
    });
  }
}
