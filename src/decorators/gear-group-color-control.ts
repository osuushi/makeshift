import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { gearColor } from "./gear-colors.js";
import type { DecoratorInstance } from "./types.js";

export function gearGroupColorControl(
  editor: SketchEditor,
  gear: DecoratorInstance,
  name: string,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "gear-group-color";
  row.textContent = "Preview color";
  const color = document.createElement("input");
  color.type = "color";
  color.value = gearColor(gear, editor.store.data.decorators ?? []);
  color.setAttribute("aria-label", `${name} preview color`);
  const hex = document.createElement("input");
  hex.type = "text";
  hex.maxLength = 7;
  hex.value = color.value;
  hex.setAttribute("aria-label", `${name} preview hex color`);
  const commit = (value: string) => {
    if (!/^#[\da-f]{6}$/i.test(value)) {
      hex.setAttribute("aria-invalid", "true");
      return;
    }
    hex.removeAttribute("aria-invalid");
    if (value.toLowerCase() === gearColor(gear, editor.store.data.decorators ?? [])) return;
    void toolCatalog(editor).activate({
      finishEdit: true,
      reason: () => null,
      run: () =>
        editor.store.request({
          kind: "decorator",
          edit: { action: "gear-color", id: gear.id, color: value },
        }),
    });
  };
  color.onchange = () => commit(color.value);
  hex.onchange = () => commit(hex.value);
  hex.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      if (event.key === "Enter") commit(hex.value);
      else {
        hex.value = color.value;
        hex.removeAttribute("aria-invalid");
      }
    }
  };
  color.disabled = hex.disabled = editor.store.busy || !!editor.interactions.current;
  row.append(color, hex);
  return row;
}
