import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";

export function visibilityControls(
  editor: SketchEditor,
  selectedPlane: () => string | undefined,
): () => void {
  const catalog = toolCatalog(editor);
  const disposeButton = isolationButton(editor);
  const dispose = [true, false].map((visible) =>
    catalog.register({
      id: visible ? "show-bodies" : "hide-bodies",
      finishEdit: true,
      label: visible ? "Show bodies" : "Hide bodies",
      category: "View",
      reason: () =>
        idleReason(editor) ??
        (editor.visibility.isolating && !visible
          ? "Exit isolation to hide all bodies"
          : !editor.store.data.bodies?.length
            ? "Create a body first"
            : editor.bodiesVisible === visible
              ? `Bodies are already ${visible ? "shown" : "hidden"}`
              : null),
      run: () => {
        editor.bodiesVisible = visible;
        editor.modeling.targets = [];
        editor.modeling.hover = null;
        editor.refresh();
      },
    }),
  );
  dispose.push(
    catalog.register({
      id: "isolate",
      finishEdit: true,
      label: "Isolate selection",
      category: "View",
      aliases: ["isolate"],
      reason: () => {
        const ids = selectedOwners(editor, selectedPlane());
        return idleReason(editor) ?? (ids.length ? null : "Select an object or its geometry first");
      },
      run: () => {
        const ids = selectedOwners(editor, selectedPlane());
        if (ids.some((id) => editor.store.data.bodies?.some((body) => body.id === id)))
          editor.bodiesVisible = true;
        editor.visibility.isolate(ids);
        editor.refresh();
      },
    }),
    catalog.register({
      id: "end-isolation",
      finishEdit: true,
      label: "Exit isolation",
      category: "View",
      aliases: ["show all after isolation"],
      reason: () =>
        idleReason(editor) ?? (editor.visibility.isolating ? null : "Isolation is not active"),
      run: () => {
        editor.visibility.endIsolation();
        editor.refresh();
      },
    }),
  );
  return () => {
    disposeButton();
    for (const remove of dispose) remove();
  };
}

function isolationButton(editor: SketchEditor): () => void {
  const catalog = toolCatalog(editor);
  const exitButton = document.createElement("button");
  exitButton.className = "exit-isolation";
  exitButton.textContent = "Exit isolation";
  exitButton.hidden = true;
  exitButton.onclick = () => void catalog.invoke("end-isolation");
  editor.world.host.append(exitButton);
  const updateButton = () => {
    exitButton.hidden = !editor.visibility.isolating;
    exitButton.disabled = !!catalog.reason({ reason: () => null });
  };
  editor.world.changed.add(updateButton);
  return () => {
    editor.world.changed.delete(updateButton);
    exitButton.remove();
  };
}

function selectedOwners(editor: SketchEditor, plane?: string): string[] {
  const ids = (editor.world.active ? [] : editor.modeling.targets).map((target) =>
    target.kind === "body" || target.kind === "face" || target.kind === "edge"
      ? target.body
      : target.sketch,
  );
  if (editor.world.active && editor.selected.targets.length && editor.sketch)
    ids.push(editor.sketch.id);
  if (plane) ids.push(plane);
  return [...new Set(ids)];
}
