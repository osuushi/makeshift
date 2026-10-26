import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

export function toggleBodyXray(editor: SketchEditor, ids: readonly string[]): void {
  const enabled = !ids.every((id) => editor.visibility.xray.has(id));
  for (const id of ids) {
    if (!editor.store.data.bodies?.some((body) => body.id === id)) continue;
    if (enabled) editor.visibility.xray.add(id);
    else editor.visibility.xray.delete(id);
  }
  editor.modeling.hover = null;
  editor.refresh();
}

export function bodyXrayTool(editor: SketchEditor): () => void {
  const selected = () => [
    ...new Set(
      editor.modeling.targets.flatMap((target) => ("body" in target ? [target.body] : [])),
    ),
  ];
  return toolCatalog(editor).register({
    id: "body-xray",
    label: "Toggle body X-ray",
    category: "View",
    aliases: ["xray", "x-ray", "see through", "enclosure"],
    description: "Reveal enclosed bodies and give them picking precedence.",
    selection: { model: ["body", "face", "edge"], pickBodies: true },
    reason: () => idleReason(editor) ?? (selected().length ? null : "Select a body first"),
    run: () => toggleBodyXray(editor, selected()),
  });
}
