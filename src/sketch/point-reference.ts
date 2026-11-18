import { arcCircle } from "./arc-geometry.js";
import type { PointReference, Sketch } from "./document.js";

export const endpointKey = (p: PointReference): string => `${p.curve}/${p.end}`;
export function linkedPointCoordinate(sketch: Sketch, p: PointReference) {
  if (!["a", "b", "center"].includes(p.end)) throw new Error("Unknown point reference");
  const curve = sketch.curves.find((c) => c.id === p.curve);
  if (p.end === "center" && curve && (curve.kind === "circle" || curve.kind === "arc"))
    return curve.kind === "circle" ? curve.center : arcCircle(curve).center;
  if (p.end !== "center" && curve && curve.kind !== "circle") return curve[p.end];
  throw new Error("Point linking requires a curve endpoint or circle/arc center");
}
