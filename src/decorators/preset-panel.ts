import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import { documentPresets } from "./ephemeral-presets.js";
import { presetNameDialog } from "./preset-name-dialog.js";
import { presetSelector } from "./preset-selector.js";
import { localPreset, presetCopyName, presetName } from "./presets.js";
import type { DecoratorEdit, DecoratorInstance } from "./types.js";

export function appendPresetControls(
  root: HTMLElement,
  editor: SketchEditor,
  instances: DecoratorInstance[],
): void {
  const controls = document.createElement("div");
  controls.className = "decorator-preset-controls";
  const run = (edit: DecoratorEdit) =>
    toolCatalog(editor).activate({
      finishEdit: true,
      reason: () => null,
      run: () => {
        if (edit.action === "preset" && edit.operation !== "select")
          return namePreset(editor, edit);
        return editor.store.request({ kind: "decorator", edit });
      },
    });
  controls.append(presetSelector(editor.store.data, instances, run));
  root.append(controls);
}

function namePreset(editor: SketchEditor, edit: Extract<DecoratorEdit, { action: "preset" }>) {
  const source = editor.store.data;
  const first = source.decorators?.find((d) => edit.ids.includes(d.id));
  if (!first) return false;
  const local = localPreset(source, first);
  const presets = documentPresets(source);
  const rename = edit.operation === "rename";
  if (rename && !local) return false;
  const name =
    rename && local ? local.name : presetCopyName(presets, local?.name ?? presetName(first));
  presetNameDialog(
    rename ? "Rename preset" : "Save preset",
    name,
    presets,
    rename ? local?.id : undefined,
    async (name) => {
      const success = await editor.store.request({ kind: "decorator", edit: { ...edit, name } });
      return success ? undefined : editor.message || "Could not save this preset";
    },
  );
  return true;
}
