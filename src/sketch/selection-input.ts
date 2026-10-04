import { toolCatalog } from "../tools/catalog.js";
import type { SketchEditor } from "./editor.js";
import { connectedSelection } from "./geometry.js";
import { pick } from "./picking.js";
import { pointKey } from "./point-query.js";
import { choosePoints, chosenPoints, togglePoint } from "./point-selection.js";
import { type Hit, hitIds } from "./sketch-hit.js";

export function selectHit(
  editor: SketchEditor,
  hit: Hit,
  event: Pick<MouseEvent, "metaKey" | "ctrlKey" | "shiftKey">,
): boolean {
  if (hit.kind === "rotate" || hit.kind === "translate") {
    editor.transformAxis = hit.kind === "translate" ? hit.axis : null;
    editor.transformRotation = hit.kind === "rotate";
    editor.transformDistance = 0;
    return true;
  }
  if (hit.kind === "bow") {
    editor.bowSide = hit.side;
    return true;
  }
  const toggle = event.metaKey || event.ctrlKey;
  const additive = toggle || event.shiftKey;
  if (editor.moveMode && !additive && hitIds(hit).every((id) => editor.selectionOwners.has(id)))
    return true;
  if (hit.kind === "group") {
    if (
      !additive &&
      !editor.selected.firstPointKey &&
      hit.group.members.every((id) => editor.selectedCurves.has(id))
    )
      return true; // Clicking within an existing multiselection keeps the other targets.

    if (additive && !toggle && hit.group.members.every((id) => editor.selectedCurves.has(id)))
      return true;
    const members = new Set(hit.group.members);
    const remove = toggle && hit.group.members.every((id) => editor.selectedCurves.has(id));
    const others = additive
      ? editor.selected.targets.filter(
          (target) =>
            !(target.kind === "group" && target.group === hit.group.id) &&
            !(target.kind === "curve" && members.has(target.curve)),
        )
      : [];
    editor.selectTargets(remove ? others : [...others, { kind: "group", group: hit.group.id }]);
    return true;
  }
  if (pointKey(hit)) {
    if (additive) togglePoint(editor, hit, toggle);
    else choosePoints(editor, chosenPoints(editor, hit));
  } else {
    const ids = hitIds(hit);
    if (additive) {
      const curves = new Set(editor.selectedCurves);
      const remove = toggle && ids.every((id) => curves.has(id));
      for (const id of ids) {
        if (remove) curves.delete(id);
        else curves.add(id);
      }
      const points = editor.selected.pointHits(editor.sketch);
      if (points.length) choosePoints(editor, points, curves);
      else editor.select(curves);
      return false;
    }
    if (editor.selected.firstPointKey || !ids.every((id) => editor.selectedCurves.has(id)))
      editor.select(ids);
  }
  if (hit.kind === "handle") editor.activeHandle = hit.handle;
  return true;
}

/** Double-click selects the connected curve component through ordinary sketch picking. */
export function selectConnected(editor: SketchEditor, event: MouseEvent): void {
  if (
    toolCatalog(editor).switching ||
    editor.tool === "trim" ||
    event.shiftKey ||
    event.metaKey ||
    event.ctrlKey
  )
    return;
  const hit = pick(editor, { x: event.clientX, y: event.clientY }),
    sketch = editor.sketch;
  if (!editor.blocked && !editor.isDragging && hit && sketch && !pointKey(hit)) {
    editor.select(connectedSelection(sketch, new Set(hitIds(hit))));
    editor.overlaps = null;
    editor.refresh();
  }
}
