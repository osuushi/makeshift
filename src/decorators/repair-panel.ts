import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { resolveFaces } from "./cylinder.js";
import { threadDefinition } from "./thread-settings.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export function appendDecoratorRepairs(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
): void {
  const selected = () =>
    editor.modeling.targets.flatMap((t) =>
      t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
    );
  const edit = (edit: DecoratorEdit) => editor.store.request({ kind: "decorator", edit });
  const ineligible = () => {
    try {
      if (selected().length !== editor.modeling.targets.length) return true;
      resolveFaces(editor.store.data.bodies ?? [], selected());
      return false;
    } catch {
      return true;
    }
  };
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
    const reassign = button(
      custom ? "Use selected faces for this decorator" : "Use selected faces for these threads",
      () => {
        return edit({ action: "reassign", id: instance.id, faces: selected() });
      },
    );
    reassign.disabled = custom || !!ineligible();
    reassign.dataset.unavailable = String(reassign.disabled);
    if (custom)
      void editor.store
        .inspectDecorator({
          definition: instance.definition,
          version: instance.version,
          faces: selected(),
          instanceId: instance.id,
          reassign: true,
        })
        .then((result) => {
          if (!reassign.isConnected) return;
          reassign.disabled = !!result.reason;
          reassign.dataset.unavailable = String(reassign.disabled);
          reassign.title = result.reason ?? "";
        })
        .catch(() => {});
    button(custom ? "Remove unresolved decorator" : "Remove unresolved thread decorator", () => {
      return edit({ action: "discard", id: instance.id });
    });
  }
}
