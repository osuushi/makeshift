import type { Curve } from "./document.js";
import type { SketchEditor } from "./editor.js";
import { hasClosedEndpoints } from "./loop-boundary.js";

export function selectedOffsetCurves(e: SketchEditor): Curve[] | undefined {
  if (
    !e.selectionOwners.size ||
    (e.rectangleContext && e.selectionOwners.size !== e.rectangleContext.members.length) ||
    e.selected.firstPointKey ||
    e.pointMenu ||
    e.selected.pointKeys?.size
  )
    return undefined;
  const curves = e.sketch?.curves.filter((c) => e.selectionOwners.has(c.id));
  return curves &&
    ((curves.length === 1 && curves[0].kind !== "bezier") || hasClosedEndpoints(curves))
    ? curves
    : undefined;
}
