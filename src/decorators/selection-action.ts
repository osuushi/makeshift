import type { SketchEditor } from "../sketch/editor.js";
import { idleReason, toolCatalog } from "../tools/catalog.js";
import type { FaceReference } from "./types.js";

/** Custom code validates face combinations asynchronously; Next waits for that verdict. */
export async function selectDecoratorInputs(
  editor: SketchEditor,
  label: string,
  inspect: (faces: FaceReference[]) => Promise<string | null>,
  run: (faces: FaceReference[]) => unknown,
): Promise<void> {
  const catalog = toolCatalog(editor);
  if (!(await catalog.activate({ reason: () => null, run: () => true }))) return;
  const selected = () =>
    editor.modeling.targets.flatMap((t) =>
      t.kind === "face" ? [{ body: t.body, face: t.face }] : [],
    );
  const results = new Map<string, string | null>();
  const snapshot = editor.store.data;
  const content = JSON.stringify(snapshot);
  const unchanged = () =>
    editor.store.data === snapshot || JSON.stringify(editor.store.data) === content;
  const check = (faces: FaceReference[]) => {
    const key = JSON.stringify(faces);
    if (!results.has(key)) {
      results.set(key, "Checking selected geometry…");
      void inspect(faces)
        .then((reason) => {
          results.set(key, reason);
          if (unchanged()) editor.refresh();
        })
        .catch((error) => {
          results.set(key, String(error));
          if (unchanged()) editor.refresh();
        });
    }
    return results.get(key) ?? null;
  };
  const faces = selected();
  const initial = JSON.stringify(editor.modeling.targets);
  // Validate the entire face category before deciding whether narrowing is sufficient.
  if (faces.length) {
    try {
      results.set(JSON.stringify(faces), await inspect(faces));
    } catch (error) {
      results.set(JSON.stringify(faces), String(error));
    }
  }
  if (
    !unchanged() ||
    JSON.stringify(editor.modeling.targets) !== initial ||
    editor.interactions.current
  )
    return;
  await catalog.activate({
    id: "custom-decorator-selection",
    label,
    selection: { model: ["face"] },
    reason: () =>
      idleReason(editor) ??
      (editor.world.active
        ? "Select faces in Modeling"
        : !selected().length || selected().length !== editor.modeling.targets.length
          ? "Select faces to decorate"
          : check(selected())),
    run: () => run(selected()),
  });
}
