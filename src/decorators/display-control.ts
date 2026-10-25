import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { validDecoratorDisplay } from "./display-mode.js";
import type { DecoratorInstance } from "./types.js";

export function appendDecoratorDisplay(
  root: HTMLElement,
  editor: SketchEditor,
  instances: readonly DecoratorInstance[],
): void {
  const label = document.createElement("label");
  label.textContent = "Display";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Decorator display");
  select.innerHTML = `<option value="default">By default</option><option value="detailed">Geometry</option><option value="texture">Texture</option><option value="color-only">Color only</option>`;
  const values = new Set(instances.map((instance) => instance.display ?? "default"));
  if (values.size > 1) {
    const mixed = new Option("Mixed", "mixed", true, true);
    mixed.disabled = true;
    select.prepend(mixed);
  } else select.value = instances[0].display ?? "default";
  select.disabled = editor.blocked;
  select.onchange = () => {
    const mode = select.value;
    if (mode !== "default" && !validDecoratorDisplay(mode)) return;
    void toolCatalog(editor).activate({
      finishEdit: true,
      reason: () => null,
      run: () => {
        const current = (editor.store.data.decorators ?? []).filter((instance) =>
          instances.some((old) => old.id === instance.id),
        );
        editor.modeling.targets = current.flatMap((instance) =>
          instance.faces.map((face) => ({ kind: "face" as const, ...face })),
        );
        return editor.store.request({
          kind: "decorator",
          edit: { action: "display", ids: current.map((instance) => instance.id), mode },
        });
      },
    });
  };
  label.append(select);
  root.append(label);
}
