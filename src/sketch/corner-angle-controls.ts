import { cornerLock, meetingAngle } from "./corner-angle.js";
import { type AngleConstraint, newId } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { selectedLines } from "./line-constraints.js";
export function selectedCorner(editor: SketchEditor): AngleConstraint | null {
  if (
    editor.selectionOwners.size !== 2 ||
    editor.selected.firstPointKey ||
    editor.selected.pointKeys?.size ||
    editor.isDragging
  )
    return null;
  const [a, b] = selectedLines(editor);
  return a && b ? meetingAngle(a, b) : null;
}
export async function toggleCornerLock(editor: SketchEditor): Promise<void> {
  if (editor.blocked || editor.isDragging) return;
  await editor.numeric.commit();
  if (editor.interactions.current?.kind === "numeric") return;
  const corner = selectedCorner(editor),
    sketch = editor.sketch;
  if (!sketch || !corner) return;
  const lock = cornerLock(sketch, corner);
  await editor.editSketch({
    ...sketch,
    constraints: lock
      ? sketch.constraints.filter((c) => c.id !== lock.id)
      : [...sketch.constraints, { ...corner, id: newId() }],
  });
  editor.refresh();
}
