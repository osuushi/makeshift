import type { SketchEditor } from "../sketch/editor.js";
import { selectDecoratorInputs } from "./selection-action.js";
import type { DecoratorInstance } from "./types.js";

export function appendCustomContinue(
  root: HTMLElement,
  editor: SketchEditor,
  instance: DecoratorInstance,
): void {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Continue decorator onto selection";
  button.disabled = editor.store.busy;
  root.append(button);
  button.onclick = () =>
    void selectDecoratorInputs(
      editor,
      "Continue decorator onto selection",
      async (selected) => {
        const current = editor.store.data.decorators?.find((d) => d.id === instance.id);
        if (!current) return "The decorator is no longer present";
        const faces = [
          ...current.faces,
          ...selected.filter(
            (f) => !current.faces.some((old) => old.body === f.body && old.face === f.face),
          ),
        ];
        const result = await editor.store.inspectDecorator({
          definition: current.definition,
          version: current.version,
          instanceId: current.id,
          faces,
        });
        return (
          result.reason ??
          (result.groups.length === 1
            ? null
            : "These faces cannot continue this decoration. Apply it separately.")
        );
      },
      () => continueDecorator(editor, instance.id),
    );
}
async function continueDecorator(editor: SketchEditor, id: string): Promise<boolean> {
  const current = editor.store.data.decorators?.find((instance) => instance.id === id);
  if (!current) throw new Error("The decorator is no longer present");
  const selected = editor.modeling.targets.flatMap((target) =>
    target.kind === "face" ? [{ body: target.body, face: target.face }] : [],
  );
  const faces = [
    ...current.faces,
    ...selected.filter(
      (face) => !current.faces.some((old) => old.body === face.body && old.face === face.face),
    ),
  ];
  const result = await editor.store.inspectDecorator({
    definition: current.definition,
    version: current.version,
    instanceId: id,
    faces,
  });
  if (result.reason || result.groups.length !== 1)
    throw new Error(
      result.reason ?? "These faces cannot continue this decoration. Apply it separately.",
    );
  const accepted = await editor.store.request({
    kind: "decorator",
    edit: { action: "continue", id, faces: selected },
  });
  if (accepted) {
    const continued = editor.store.data.decorators?.find((instance) => instance.id === id);
    if (continued)
      editor.modeling.targets = continued.faces.map((face) => ({ kind: "face", ...face }));
    editor.refresh();
  }
  return accepted;
}
