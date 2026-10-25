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

export function bodyXrayButton(
  editor: SketchEditor,
  id: string,
  name: string,
  refresh: (() => void)[],
): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "body-xray";
  button.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" stroke-dasharray="3 2"/><path d="m12 7 5 3v5l-5 3-5-3v-5Z"/><path d="m7 10 5 3 5-3m-5 3v5"/></svg>`;
  button.setAttribute("aria-label", `X-ray ${name}`);
  button.title = "Toggle X-ray";
  button.onclick = () =>
    void toolCatalog(editor).activate({
      reason: () => null,
      run: () => toggleBodyXray(editor, [id]),
    });
  refresh.push(() => {
    button.setAttribute("aria-pressed", String(editor.visibility.xray.has(id)));
    button.disabled = !!toolCatalog(editor).reason({ reason: () => null });
  });
  return button;
}
