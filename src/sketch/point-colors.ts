import { Color } from "three";
import { viewportPalette } from "../preferences/viewport-theme.js";
import { displayPoints } from "./curve-geometry.js";
import type { Curve, Sketch } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { pointChoiceGroups } from "./point-choice-groups.js";
import { distance } from "./point-math.js";
import { pointHits, pointKey } from "./point-query.js";
import { type PointBranch, pointBranches, pointSelected } from "./point-selection.js";
import { hitIds } from "./sketch-hit.js";

export function pointFeedback(editor: SketchEditor, sketch: Sketch) {
  const points = pointHits(sketch).filter((hit) => pointSelected(editor, pointKey(hit) ?? ""));
  const affected = new Set(points.flatMap((hit) => [...hitIds(hit)]));
  const selected = points.flatMap(pointBranches);
  const hover = editor.pointHover;
  const hoverGroup = hover
    ? pointChoiceGroups(sketch, editor.pointMenu?.hits ?? [hover]).find((group) =>
        group.some((hit) => pointKey(hit) === pointKey(hover)),
      )
    : null;
  const hovered = hoverGroup?.flatMap(pointBranches) ?? [];
  return { affected, selected, hovered };
}
export function coloredCurve(
  curve: Curve,
  unit: number,
  base: Color,
  selected: PointBranch[],
  hovered: PointBranch[],
) {
  let points = displayPoints(curve, unit);
  const branches = selected.filter((b) => b.curve === curve.id),
    hover = hovered.filter((b) => b.curve === curve.id);
  if (!branches.length && !hover.length) return { points, colors: points.map(() => base) };
  if (curve.kind === "segment")
    points = Array.from({ length: 17 }, (_, i) => ({
      x: curve.a.x + ((curve.b.x - curve.a.x) * i) / 16,
      y: curve.a.y + ((curve.b.y - curve.a.y) * i) / 16,
    }));
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const total = lengths.at(-1) ?? 0;
  const strength = (list: PointBranch[], length: number) =>
    Math.max(
      0,
      ...list.map((b) =>
        b.fraction === null
          ? 1
          : Math.max(0, 1 - Math.abs(length - b.fraction * total) / (48 * unit)),
      ),
    );
  const blue = new Color(viewportPalette().selected),
    amber = new Color(viewportPalette().hover);
  const colors = lengths.map((length) =>
    base.clone().lerp(blue, strength(branches, length)).lerp(amber, strength(hover, length)),
  );
  return { points, colors };
}
