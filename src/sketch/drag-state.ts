import { appendCircle } from "./circle-edit.js";
import { attachmentSnap } from "./creation-links.js";
import {
  type EditingGroup,
  type Endpoint,
  emptySketch,
  newId,
  type Sketch,
  type SketchDocument,
} from "./document.js";
import type { SketchEditor } from "./editor.js";
import { rectangle } from "./geometry.js";
import { appendLine } from "./line-edit.js";
import { pickCandidates } from "./picking.js";
import type { Point } from "./planes.js";
import { add } from "./point-math.js";
import { pointKey } from "./point-query.js";
import { chosenPoints } from "./point-selection.js";
import { pointerDragThreshold } from "./pointer-intent.js";
import { type RectangleHandle, rectangleFrame } from "./rectangle-edit.js";
import { selectionFrame } from "./selection-frame.js";
import { selectHit } from "./selection-input.js";
import { pointTarget, type SelectionTarget } from "./selection-target.js";
import { type Hit, hitIds } from "./sketch-hit.js";
import { snapped } from "./snapping.js";

export type Quantity =
  | "width"
  | "height"
  | "length"
  | "radius"
  | "angle"
  | "cornerAngle"
  | "translateX"
  | "translateY";
export interface Drag {
  id: number;
  threshold: number;
  start: Point;
  startBypass: boolean;
  symmetric: boolean;
  copyIds?: Map<string, string>;
  copying?: boolean;
  startSnapped: boolean;
  linkIds: [string, string];
  screen: Point;
  displayOffset?: Point;
  anchor: Point;
  base: SketchDocument;
  sketch: Sketch;
  mode:
    | "pending"
    | "createRectangle"
    | "createLine"
    | "createBezier"
    | "createCircle"
    | "radius"
    | "bow"
    | "move"
    | "resize"
    | "endpoint"
    | "rotate"
    | "box";
  group?: EditingGroup;
  axis?: "x" | "y";
  handle?: RectangleHandle;
  endpoint?: Endpoint;
  pointTargets?: Hit[];
  wholeMoveIds?: Set<string>;
  line?: string;
  createBezier?: boolean;
  circle?: string;
  bow?: { curve: string; side: number };
  ids: Set<string>;
  beforeSelection: Set<string>;
  beforeTargets: readonly SelectionTarget[];
  moved: boolean;
  valid: boolean;
  lastPoint: Point;
  bypass: boolean;
  quantities: Partial<Record<Quantity, number>>;
  pivot: Point;
  pose: number;
  angle: number;
  hits: Hit[];
  additive: boolean;
  toggle: boolean;
}
export function orientation(editor: SketchEditor): number {
  if (editor.moveMode) return editor.selectionAngle;
  const sketch = editor.sketch,
    group = editor.rectangleContext,
    line = editor.line;
  if (sketch && group) {
    const frame = rectangleFrame(sketch, group);
    return (Math.atan2(frame.u.y, frame.u.x) * 180) / Math.PI;
  }
  if (line) return (Math.atan2(line.b.y - line.a.y, line.b.x - line.a.x) * 180) / Math.PI;
  return editor.selectionAngle;
}
function createGeometry(editor: SketchEditor, drag: Drag): void {
  const start = snapped(editor, drag.start, new Set(), drag.startBypass);
  drag.startSnapped = attachmentSnap(editor.snap?.label);
  if (editor.tool === "rectangle") {
    const created = rectangle(drag.sketch, start, add(start, { x: 1, y: 1 }));
    drag.sketch = created.sketch;
    drag.group = created.group;
    drag.mode = "createRectangle";
    drag.handle = { kind: "corner", index: 2 };
    drag.start = start;
    editor.selectGroup(created.group.id);
  } else if (editor.tool === "circle") {
    const created = appendCircle(drag.sketch, start, 1);
    drag.sketch = created.sketch;
    drag.circle = created.curve.id;
    drag.mode = "createCircle";
    drag.start = start;
    editor.select([created.curve.id]);
  } else {
    drag.start = start;
    const created = appendLine(drag.sketch, start, add(start, { x: 1, y: 0 }));
    drag.sketch = created.sketch;
    drag.line = created.curve.id;
    drag.createBezier = editor.tool === "bezier";
    drag.mode = drag.createBezier ? "createBezier" : "createLine";
    editor.select([created.curve.id]);
  }
}
export function beginDrag(editor: SketchEditor, event: PointerEvent): Drag | null {
  if (!editor.world.activeFrame) return null;
  const frame = editor.world.activeFrame;
  let point = editor.world.pointAt(frame, event.clientX, event.clientY);
  if (!point) return null;
  if (editor.placingPivot) {
    editor.pivot = snapped(editor, point, new Set(), event.shiftKey);
    editor.placingPivot = false;
    editor.message = "";
    return null;
  }
  const screen = { x: event.clientX, y: event.clientY },
    base = editor.store.data;
  const hits = pickCandidates(editor, screen);
  if (hits[0] && pointKey(hits[0]) && editor.selected.pointKeys?.size) {
    const chosen = chosenPoints(editor, hits[0]);
    if (chosen.length) hits[0] = chosen[0];
  }
  const hit = hits[0];
  const displayOffset =
    hit?.kind === "rotate" || hit?.kind === "translate" ? hit.displayOffset : undefined;
  if (displayOffset) {
    point = editor.world.pointAt(
      frame,
      event.clientX - displayOffset.x,
      event.clientY - displayOffset.y,
    );
    if (!point) return null;
  }
  const sketch = editor.sketch ?? {
    ...emptySketch(frame),
    ...(editor.world.workspace?.sketchId ? { id: editor.world.workspace.sketchId } : {}),
  };
  const drag: Drag = {
    id: event.pointerId,
    threshold: pointerDragThreshold(event),
    start: point,
    startBypass: event.shiftKey,
    symmetric: event.altKey,
    startSnapped: false,
    linkIds: [newId(), newId()],
    screen,
    displayOffset,
    anchor: hit?.point ?? point,
    base,
    sketch,
    mode: "move",
    ids: new Set(),
    beforeSelection: new Set(editor.selectedCurves),
    beforeTargets: editor.selected.targets,
    moved: false,
    valid: false,
    lastPoint: point,
    bypass: event.shiftKey,
    quantities: {},
    pivot: point,
    pose: 0,
    angle: 0,
    hits,
    toggle: event.metaKey || event.ctrlKey,
    additive: (event.shiftKey && editor.tool === "select") || event.metaKey || event.ctrlKey,
  };
  editor.overlaps = null;
  editor.pointMenu = null;
  editor.pointHover = null;
  const key = pointKey(hit ?? null);
  const selected =
    hit &&
    (key
      ? editor.selected.firstPointKey === key
      : hitIds(hit).every((id) => editor.selectionOwners.has(id)));
  if (hit && !drag.additive && (editor.tool === "select" || (selected && !editor.creationArmed))) {
    selectHit(editor, hit, event);
    configureEdit(editor, drag, hit);
  } else if (editor.tool === "select" && !hit) {
    drag.mode = "box";
    if (!drag.additive) editor.select([]);
  } else drag.mode = "pending";
  configurePointTargets(editor, drag);
  drag.ids = new Set(editor.selectionOwners);
  drag.pivot = selectionFrame(editor)?.pivot ?? point;
  drag.pose = orientation(editor);
  editor.activeHandle = drag.handle;
  return drag;
}

function configureEdit(editor: SketchEditor, drag: Drag, hit: Hit): void {
  drag.mode = "move";
  if (editor.moveMode && hit.kind !== "rotate" && hit.kind !== "translate") return;
  if (hit.kind === "translate") drag.axis = hit.axis;
  if (hit.kind === "rotate") drag.mode = "rotate";
  if (hit.kind === "bow") {
    drag.mode = "bow";
    drag.bow = { curve: hit.curve, side: hit.side };
  }
  if (hit.kind === "curve" && editor.circle?.id === hit.curve) {
    drag.mode = "radius";
    drag.circle = hit.curve;
  }
  if (
    hit.kind === "curve" &&
    hit.group &&
    [...editor.selectionOwners].every((id) => hit.group?.members.includes(id))
  ) {
    drag.mode = "resize";
    drag.group = hit.group;
    drag.handle = { kind: "edge", index: hit.group.members.indexOf(hit.curve) };
  }
  if (hit.kind === "endpoint") {
    drag.mode = "endpoint";
    drag.endpoint = hit.endpoint;
  }
  if (hit.kind === "handle") {
    drag.mode = "resize";
    drag.group = hit.group;
    drag.handle = hit.handle;
  }
}

export function resolveDrag(editor: SketchEditor, drag: Drag, event: PointerEvent): void {
  if (drag.mode !== "pending" || !drag.moved) return;
  const hit = drag.hits[0];
  const bypassEdit =
    drag.additive &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    editor.tool === "select" &&
    hit &&
    hitIds(hit).every((id) => editor.selectionOwners.has(id));
  if (drag.additive && !bypassEdit) return;
  if (bypassEdit) {
    drag.additive = false;
    configureEdit(editor, drag, hit);
  } else if (editor.tool !== "select") createGeometry(editor, drag);
  else {
    const hit = drag.hits[0];
    if (!hit) return;
    selectHit(editor, hit, event);
    configureEdit(editor, drag, hit);
  }
  configurePointTargets(editor, drag);
  drag.ids = new Set(editor.selectionOwners);
  drag.pivot = selectionFrame(editor)?.pivot ?? drag.start;
  drag.pose = orientation(editor);
  editor.activeHandle = drag.handle;
}

function configurePointTargets(editor: SketchEditor, drag: Drag): void {
  const hit = drag.hits[0];
  if (
    editor.moveMode ||
    editor.tool !== "select" ||
    !hit ||
    !pointKey(hit) ||
    drag.mode === "pending"
  )
    return;
  drag.wholeMoveIds = new Set(editor.selectedCurves);
  drag.pointTargets = chosenPoints(editor, hit);
  editor.selected.replacePoints(
    drag.pointTargets.flatMap((hit) => {
      const target = pointTarget(hit);
      return target ? [target] : [];
    }),
  );
}
