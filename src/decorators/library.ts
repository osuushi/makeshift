import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import { appendBundleControls } from "./bundle-controls.js";
import type { DecoratorDefinition } from "./definition.js";
import { selectDecoratorInputs } from "./selection-action.js";

function bundleInput(
  editor: SketchEditor,
  parent: HTMLElement,
  imported: () => void,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.hidden = true;
  input.setAttribute("aria-label", "Import decorator bundle");
  parent.append(input);
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("Decorator bundle exceeds 1 MiB");
      const definition: DecoratorDefinition = JSON.parse(await file.text());
      if (
        await editor.store.request({
          kind: "decorator-definition",
          edit: { action: "install", definition },
        })
      ) {
        imported();
      }
    } catch (error) {
      editor.message = error instanceof Error ? error.message : String(error);
      editor.refresh();
    } finally {
      input.value = "";
    }
  };
  return input;
}

function libraryEntry(
  root: HTMLElement,
  editor: SketchEditor,
  definition: DecoratorDefinition,
  button: (label: string, action: () => void) => HTMLButtonElement,
): void {
  const title = document.createElement("p");
  title.textContent = `${definition.name} · v${definition.version}`;
  root.append(title);
  appendBundleControls(root, editor, definition);
  const enabled = editor.store.decoratorSources.some(
    (s) =>
      s.id === definition.id && s.version === definition.version && s.source === definition.source,
  );
  button(`${enabled ? "Disable" : "Enable"} ${definition.name} code`, () => {
    void editor.store.request({
      kind: "decorator-enable",
      id: definition.id,
      version: definition.version,
      enabled: !enabled,
    });
  }).disabled = editor.store.busy;
  const apply = button(`Apply ${definition.name}`, () => {
    void selectDecoratorInputs(
      editor,
      `Apply ${definition.name}`,
      async (faces) =>
        (
          await editor.store.inspectDecorator({
            definition: definition.id,
            version: definition.version,
            faces,
          })
        ).reason,
      (faces) =>
        editor.store.request({
          kind: "decorator",
          edit: { action: "apply", definition: definition.id, version: definition.version, faces },
        }),
    );
  });
  apply.disabled = editor.store.busy || !enabled || !!editor.world.active;
  apply.title = !enabled
    ? "Enable this bundled code first"
    : editor.world.active
      ? "Return to Modeling first"
      : "Select faces to decorate";
}

export function decoratorLibrary(editor: SketchEditor, parent: HTMLElement): () => void {
  const root = document.createElement("section");
  root.className = "decorator-panel decorator-library";
  root.setAttribute("aria-label", "Decorator library");
  root.hidden = true;
  parent.append(root);
  let visible = false,
    key = "";
  let shownDocument = editor.store.data;
  const button = (label: string, action: () => void) => {
    const element = document.createElement("button");
    element.type = "button";
    element.textContent = label;
    element.onclick = action;
    root.append(element);
    return element;
  };
  const input = bundleInput(editor, parent, () => {
    visible = true;
    update();
  });
  const update = () => {
    root.hidden = !visible;
    if (!visible) return;
    const faces = editor.modeling.targets.flatMap((t) =>
      t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
    );
    const definitions = editor.store.data.decoratorDefinitions ?? [];
    const next = JSON.stringify([
      definitions,
      editor.store.decoratorSources,
      faces,
      editor.store.busy,
    ]);
    if (next === key && shownDocument === editor.store.data) return;
    key = next;
    shownDocument = editor.store.data;
    root.replaceChildren();
    const title = document.createElement("h2");
    title.textContent = "Decorator library";
    root.append(title);
    button("Close decorator library", () => {
      visible = false;
      update();
    });
    button("Import decorator bundle", () => input.click()).disabled = editor.store.busy;
    for (const definition of definitions) libraryEntry(root, editor, definition, button);
  };
  const unregister = toolCatalog(editor).register({
    id: "decorator-library",
    label: "Decorator library",
    category: "Solid",
    aliases: ["import decorator", "custom decorator", "plugins"],
    reason: () => idleReason(editor),
    run: () => {
      visible = true;
      key = "";
      update();
    },
  });
  editor.world.changed.add(update);
  return () => {
    unregister();
    editor.world.changed.delete(update);
    root.remove();
    input.remove();
  };
}
