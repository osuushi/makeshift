import type { SketchDocument } from "../sketch/document.js";
import { planeNormal } from "../sketch/planes.js";
import type { BodyGeometry, Edge } from "./body.js";
import type { DisplayDocument } from "./display-document.js";
import { featureEdges } from "./feature-edges.js";
import type { PlaneCut } from "./plane-cut.js";

/** Section edges only: splitting a boundary also assigns new IDs off the cutter. */
export function planeCutEdges(
  original: SketchDocument,
  candidate: DisplayDocument,
  operation: PlaneCut,
): { body: BodyGeometry; edge: Edge }[] {
  const sources = new Set(operation.targets.map((target) => target.body));
  const originalEdges = (original.bodies ?? [])
    .filter((body) => sources.has(body.id))
    .flatMap((body) => body.edges);
  const ids = new Set(originalEdges.map((edge) => edge.id));
  const signatures = new Set(originalEdges.map((edge) => JSON.stringify(edge.signature)));
  const untouched = new Set(
    (original.bodies ?? []).filter((body) => !sources.has(body.id)).map((body) => body.id),
  );
  const normal = planeNormal(operation.frame);
  return (candidate.bodies ?? [])
    .filter((body) => !untouched.has(body.id))
    .flatMap((body) =>
      featureEdges(body)
        .filter((edge) => {
          if (
            operation.mode === "imprint" &&
            (ids.has(edge.id) || signatures.has(JSON.stringify(edge.signature)))
          )
            return false;
          if (edge.points.length < 6) return false;
          for (let i = 0; i < edge.points.length; i += 3) {
            const distance = normal.reduce(
              (sum, n, axis) => sum + n * (edge.points[i + axis] - operation.frame.origin[axis]),
              0,
            );
            if (Math.abs(distance) > 1e-5) return false;
          }
          return true;
        })
        .map((edge) => ({ body, edge })),
    );
}
