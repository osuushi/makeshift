import type { SketchEditor } from "../sketch/editor.js";
import { toolCatalog } from "../tools/catalog.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

export function appendCustomContinue(
  root: HTMLElement,
  editor: SketchEditor,
  instance: DecoratorInstance,
  selected: FaceReference[],
): void {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Continue decorator onto selection";
  button.disabled = true;
  button.dataset.unavailable = "true";
  const note = document.createElement("p");
  note.textContent = "Checking selected geometry…";
  root.append(button, note);
  const faces = [
    ...instance.faces,
    ...selected.filter(
      (f) => !instance.faces.some((old) => old.body === f.body && old.face === f.face),
    ),
  ];
  const snapshot = editor.store.data;
  void editor.store
    .inspectDecorator({
      definition: instance.definition,
      version: instance.version,
      instanceId: instance.id,
      faces,
    })
    .then((result) => {
      if (!button.isConnected || editor.store.data !== snapshot) return;
      const reason =
        result.reason ??
        (result.groups.length === 1
          ? null
          : "These faces cannot continue this decoration. Apply it separately.");
      button.disabled = !!reason || editor.store.busy;
      button.dataset.unavailable = String(!!reason);
      button.title = reason ?? "";
      note.textContent = reason ?? "";
      note.hidden = !reason;
    })
    .catch((error) => {
      if (note.isConnected) note.textContent = String(error);
    });
  button.onclick = () =>
    void toolCatalog(editor).activate({
      finishEdit: true,
      reason: () => null,
      run: () => continueDecorator(editor, instance.id),
    });
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
