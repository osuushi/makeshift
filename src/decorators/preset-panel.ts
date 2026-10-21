import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { localPreset, sameSettings } from "./presets.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export function appendPresetControls(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
): void {
  const first = instances[0];
  const local = instances.every((d) => d.presetId === first.presetId)
    ? localPreset(editor.store.data, first)
    : undefined;
  const matching = instances.every((d) => sameSettings(d.settings, first.settings));
  const controls = document.createElement("div");
  controls.className = "decorator-preset-controls";
  const run = (edit: DecoratorEdit) =>
    toolCatalog(editor).activate({
      finishEdit: true,
      reason: () => null,
      run: () => editor.store.request({ kind: "decorator", edit }),
    });
  const ids = instances.map((d) => d.id);
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Document preset");
  select.append(new Option(matching ? "Current settings" : "Mixed settings", ""));
  for (const preset of editor.store.data.decoratorPresets ?? []) {
    if (preset.definition === first.definition && preset.version === first.version)
      select.append(new Option(preset.name, preset.id));
  }
  select.value = matching ? (local?.id ?? "") : "";
  select.onchange = () => {
    if (select.value)
      void run({ action: "preset", operation: "select", ids, presetId: select.value });
  };
  const duplicate = document.createElement("button");
  duplicate.type = "button";
  duplicate.textContent = "Duplicate preset";
  duplicate.disabled = !matching;
  duplicate.dataset.unavailable = String(!matching);
  duplicate.onclick = () => void run({ action: "preset", operation: "duplicate", ids });
  controls.append(select, duplicate);
  if (local && matching) {
    const name = document.createElement("input");
    name.type = "text";
    name.value = local.name;
    name.maxLength = 200;
    name.setAttribute("aria-label", "Preset name");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.textContent = "Rename preset";
    const accept = () => {
      if (name.value !== local.name)
        void run({ action: "preset", operation: "rename", ids, name: name.value });
    };
    name.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        accept();
      }
      if (event.key === "Escape") {
        event.stopPropagation();
        name.value = local.name;
      }
    };
    rename.onclick = accept;
    controls.append(name, rename);
  }
  root.append(controls);
}
