import { bowGuides } from "./arc-edit.js";
import { closestOnCurve, curveDistance } from "./curve-geometry.js";
import type { SketchEditor } from "./editor.js";
import type { Point } from "./planes.js";
import { distance, dot, subtract } from "./point-math.js";
import { pointHits, rectangleHandles } from "./point-query.js";
import { rectangleFrame } from "./rectangle-edit.js";
import { selectionFrame } from "./selection-frame.js";
import type { Hit } from "./sketch-hit.js";
import { sketchWidgetTarget } from "./sketch-widget-layout.js";
import { sketchRotationVisible, transformHandles } from "./transform-handles.js";

function selectedHandle(editor: SketchEditor, screen: Point): Hit | null {
  const sketch = editor.sketch;
  if (!sketch) return null;
  const project = (point: Point) => editor.world.projectLocal(sketch.plane, point);
  const local = editor.world.pointAt(sketch.plane, screen.x, screen.y);
  const unit = editor.world.height / editor.world.canvas.clientHeight;
  const guides = bowGuides(editor).sort(
    (a, b) => distance(project(a.point), screen) - distance(project(b.point), screen),
  );
  for (const guide of guides) {
    const line = sketch.curves.find((c) => c.id === guide.curve);
    const guideDistance = distance(project(guide.point), screen);
    // Shallow multi-bow guides can be only a few pixels off a short edge.
    // Their hit radius must not swallow the nearer edge or its midpoint.
    const midpointHit =
      guideDistance <= 9 &&
      (line?.kind !== "segment" || !local || guideDistance < curveDistance(line, local) / unit);
    const guideHit =
      local &&
      line &&
      line.kind !== "circle" &&
      distance(project(line.a), screen) > 12 &&
      distance(project(line.b), screen) > 12 &&
      curveDistance(line, local) > 6 * unit &&
      curveDistance(guide.shape, local) < 4 * unit;
    if (midpointHit || guideHit) return { kind: "bow", ...guide };
  }
  const widget = transformHandles(editor);
  if (widget) {
    for (const handle of widget.axes) {
      const target = sketchWidgetTarget(editor, handle.axis);
      if (target && distance(target.screen, screen) <= target.radius)
        return {
          kind: "translate",
          ...handle,
          displayOffset: target.offset,
          displayScreen: target.screen,
        };
    }
    const target = sketchWidgetTarget(editor, "rotation");
    if (
      widget.rotationVisible &&
      target &&
      distance(target.screen, screen) <= target.radius &&
      local
    )
      return {
        kind: "rotate",
        point: widget.rotation,
        displayOffset: target.offset,
        displayScreen: target.screen,
      };
  }
  const selection = selectionFrame(editor);
  const standalone = sketchWidgetTarget(editor, "rotation");
  if (
    !widget &&
    !editor.circle &&
    selection &&
    sketchRotationVisible(editor) &&
    standalone &&
    distance(standalone.screen, screen) <= standalone.radius
  ) {
    return {
      kind: "rotate",
      point: selection.handle,
      displayOffset: standalone.offset,
      displayScreen: standalone.screen,
    };
  }
  const group = editor.rectangleContext;
  if (group) {
    for (const { point, handle } of rectangleHandles(sketch, group))
      if (distance(project(point), screen) <= 8) return { kind: "handle", group, handle, point };
    const center = rectangleFrame(sketch, group).center;
    if (distance(project(center), screen) <= 8) return { kind: "center", group, point: center };
  }
  return null;
}
export function pickCandidates(editor: SketchEditor, screen: Point): Hit[] {
  const sketch = editor.sketch;
  if (!sketch) return [];
  const handle = selectedHandle(editor, screen);

  const project = (point: Point) => editor.world.projectLocal(sketch.plane, point);
  const points = pointHits(sketch);
  const nearby = points
    .filter((hit) => distance(project(hit.point), screen) <= 8)
    .sort((a, b) => distance(project(a.point), screen) - distance(project(b.point), screen));
  if (
    handle &&
    !(
      handle.kind === "rotate" &&
      nearby[0] &&
      distance(project(nearby[0].point), screen) <
        distance(handle.displayScreen ?? project(handle.point), screen)
    )
  )
    return [handle];
  if (nearby.length) return [nearby[0]];
  const local = editor.world.pointAt(sketch.plane, screen.x, screen.y);
  if (!local) return [];
  const pixelsPerUnit = editor.world.canvas.clientHeight / editor.world.height;
  const near = sketch.curves
    .map((curve) => ({
      curve,
      distance: curveDistance(curve, local) * pixelsPerUnit,
    }))
    .filter((hit) => hit.distance <= 8)
    .sort((a, b) => a.distance - b.distance || a.curve.id.localeCompare(b.curve.id));
  if (near.length) {
    const seen = new Set<string>();
    return near
      .filter((hit) => hit.distance <= near[0].distance + 1)
      .flatMap(({ curve }): Hit[] => {
        const group = sketch.groups.find((item) => item.members.includes(curve.id)),
          key = group?.id ?? curve.id;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            kind: "curve",
            curve: curve.id,
            point: closestOnCurve(curve, local),
            group,
          },
        ];
      });
  }
  const interiors = sketch.curves.flatMap((curve): Hit[] =>
    curve.kind === "circle" && distance(local, curve.center) < curve.radius
      ? [{ kind: "circleBody", curve: curve.id, point: curve.center }]
      : [],
  );
  return [
    ...interiors,
    ...sketch.groups
      .map((group) => ({ group, frame: rectangleFrame(sketch, group) }))
      .filter(({ frame }) => {
        const relative = subtract(local, frame.corners[0]),
          x = dot(relative, frame.u),
          y = dot(relative, frame.v);
        return x > 0 && x < frame.width && y > 0 && y < frame.height;
      })
      .sort((a, b) => a.frame.width * a.frame.height - b.frame.width * b.frame.height)
      .map(({ group, frame }): Hit => ({ kind: "group", group, point: frame.center })),
  ];
}
export const pick = (editor: SketchEditor, screen: Point): Hit | null =>
  pickCandidates(editor, screen)[0] ?? null;
