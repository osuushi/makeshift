import type { DisplayDocument } from "../model/display-document.js";
import type { ScaleSource } from "../model/scale.js";
import { scaleSelection } from "../model/scale-selection.js";
import type { SketchEditor } from "../sketch/editor.js";
import { edgeFeature, near } from "./geometry.js";
import type { GuideAnchor } from "./types.js";

/** Move uses the actual selection; a direct guide drag otherwise moves its owner. */
export function guideMoveSource(editor: SketchEditor, anchor: GuideAnchor): ScaleSource | null {
  if (editor.world.active ? editor.moveMode : editor.modeling.tool === "move") {
    const selected = scaleSelection(editor);
    if (selected) return selected;
    if (editor.world.active && editor.sketch && editor.selected.points.length)
      return { kind: "curves", sketchId: editor.sketch.id, ids: [...editor.selectionOwners] };
    return null;
  }
  return anchor.kind === "sketch-curve"
    ? { kind: "sketches", ids: [anchor.sketch] }
    : { kind: "solids", ids: [anchor.body], faces: [], edges: [] };
}

/** Stationary snapping geometry only. This view is never published or accepted. */
export function guideTargetDocument(
  document: DisplayDocument,
  source: ScaleSource,
): DisplayDocument {
  const touchedBodies = new Set(
    source.kind === "solids"
      ? [...source.ids, ...source.faces.map((f) => f.body), ...source.edges.map((e) => e.body)]
      : [],
  );
  return {
    ...document,
    sketches: document.sketches.flatMap((sketch) => {
      if (source.kind === "sketches" && source.ids.includes(sketch.id)) return [];
      if (source.kind !== "curves" || source.sketchId !== sketch.id) return [sketch];
      return [
        {
          ...sketch,
          curves: sketch.curves.filter((c) => !source.ids.includes(c.id)),
          groups: sketch.groups.filter((g) => g.members.every((id) => !source.ids.includes(id))),
        },
      ];
    }),
    bodies: document.bodies?.flatMap((body) => {
      if (source.kind !== "solids" || !touchedBodies.has(body.id)) return [body];
      if (source.ids.includes(body.id)) return [];
      const moved = new Set([
        ...source.edges.filter((e) => e.body === body.id).map((e) => e.edge),
        ...body.faces
          .filter((f) => source.faces.some((s) => s.body === body.id && s.face === f.id))
          .flatMap((f) => f.edges),
      ]);
      const points = body.edges
        .filter((e) => moved.has(e.id))
        .flatMap((e) =>
          (["start", "end"] as const).flatMap((feature) => {
            const p = edgeFeature(e, feature);
            return p ? [p] : [];
          }),
        );
      for (const edge of body.edges)
        if (
          (["start", "end"] as const).some((f) => {
            const p = edgeFeature(edge, f);
            return p && points.some((q) => near(p, q));
          })
        )
          moved.add(edge.id);
      return [
        {
          ...body,
          edges: body.edges.filter((e) => !moved.has(e.id)),
          faces: body.faces.filter((f) => !f.edges.some((id) => moved.has(id))),
        },
      ];
    }),
    guidePoints: document.guidePoints?.filter(
      (p) => p.anchor.kind !== "body-center" || !touchedBodies.has(p.anchor.body),
    ),
  };
}
