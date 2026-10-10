import { newId } from "../sketch/document.js";
import type { SketchEditor } from "../sketch/editor.js";
import { readClipboard } from "./geometry.js";

export async function pasteSelection(editor: SketchEditor, text: string): Promise<boolean> {
  const geometry = readClipboard(text);
  const before = editor.store.data;
  const workspace = editor.world.workspace;
  const target =
    workspace && !geometry.bodies.length
      ? {
          id: editor.sketch?.id ?? workspace.sketchId ?? newId(),
          plane: workspace.frame,
        }
      : undefined;
  if (!(await editor.store.request({ kind: "paste-geometry", text, target }))) return false;
  const after = editor.store.data;
  const oldBodies = new Set(before.bodies?.map((body) => body.id));
  const bodies = (after.bodies ?? []).filter((body) => !oldBodies.has(body.id));
  if (target && !bodies.length) {
    if (workspace && workspace.sketchId !== target.id) {
      workspace.sketchId = target.id;
      // Workspace identity changes clear old intent during draw; select copies afterwards.
      editor.refresh();
    }
    const originalIds = new Set(
      before.sketches.find((s) => s.id === target.id)?.curves.map((c) => c.id),
    );
    const sketch = after.sketches.find((s) => s.id === target.id);
    editor.tool = "select";
    editor.creationArmed = false;
    editor.selectTargets(
      (sketch?.curves ?? [])
        .filter((c) => !originalIds.has(c.id))
        .map((curve) => ({ kind: "curve", curve: curve.id })),
    );
  } else {
    if (workspace) editor.world.exit();
    const oldSketches = new Set(before.sketches.map((sketch) => sketch.id));
    editor.modeling.memberBody = null;
    editor.modeling.targets = [
      ...bodies.map((body) => ({ kind: "body" as const, body: body.id })),
      ...after.sketches
        .filter((s) => !oldSketches.has(s.id))
        .map((sketch) => ({ kind: "sketch" as const, sketch: sketch.id })),
    ];
  }
  editor.message = "Pasted geometry · Move (M) to reposition";
  editor.refresh();
  return true;
}
