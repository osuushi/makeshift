import type { BodyEdgeFinish, BodyGeometry, Edge } from "./body.js";
import type { DisplayDocument } from "./display-document.js";

/** Resolve the exact calculation's stable IDs into the displayed candidate. */
export function planeCutEdges(
  candidate: DisplayDocument,
  targets: BodyEdgeFinish["edges"],
): { body: BodyGeometry; edge: Edge }[] {
  return targets.flatMap((target) => {
    const body = candidate.bodies?.find((body) => body.id === target.body);
    const edge = body?.edges.find((edge) => edge.id === target.edge);
    return body && edge ? [{ body, edge }] : [];
  });
}
