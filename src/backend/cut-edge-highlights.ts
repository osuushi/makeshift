import type { Body, BodyEdgeFinish } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import { featureEdges } from "../model/feature-edges.js";
import type { SketchDocument } from "../sketch/document.js";

/** Immediate cut feedback, never serialized into the application document. */
export const cutEdgeHighlights = new WeakMap<SketchDocument, BodyEdgeFinish["edges"]>();

export function sectionEdges(bodies: Body[], split: boolean): BodyEdgeFinish["edges"] {
  return bodies.flatMap((body) => {
    const origins = topologyOrigins.get(body);
    if (!origins?.edges) return [];
    // Split caps have no target-face ancestor. Their borders include existing
    // imprints reused by the cut, as well as freshly generated intersections.
    const caps = new Set(
      split
        ? body.faces.filter((face) => !origins.faces.get(face.id)?.length).flatMap((f) => f.edges)
        : [],
    );
    return featureEdges(body)
      .filter((edge) => !origins.edges?.get(edge.id)?.length || caps.has(edge.id))
      .map((edge) => ({ body: body.id, edge: edge.id }));
  });
}
