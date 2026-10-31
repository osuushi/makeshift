import * as THREE from "three";
import { previewFaceKey } from "../decorators/preview-compositor.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { BodyGeometry, Edge, Face } from "./body.js";
import type { VisualBody } from "./visual-preview.js";

export interface SelectionBody {
  id: string;
  faces: readonly Pick<Face, "id" | "vertices" | "edges">[];
  edges: readonly Pick<Edge, "id" | "points">[];
  /** Native correspondence is appearance/selection evidence, never editable preview topology. */
  source?: VisualBody;
}

const cache = new WeakMap<VisualBody, SelectionBody>();

/** Decorator previews still refer to accepted supports during mesh-first drawing. */
export function includePreviewSupports(
  bodies: readonly SelectionBody[],
  hidden: Set<string>,
): void {
  for (const body of bodies) {
    if (!body.source) continue;
    for (const face of body.faces) {
      if (!hidden.has(previewFaceKey(body.id, face.id))) continue;
      for (const owner of body.source.sourceBodies ?? [])
        for (const source of body.source.sourceFaces?.[Number(face.id)] ?? [])
          hidden.add(previewFaceKey(owner, source));
    }
  }
}

export function selectedRevealGeometry(
  body: SelectionBody,
  targets: readonly ModelingTarget[],
): readonly number[][] {
  const faces = selectedRevealFaces(
    body,
    targets.filter((target) => target.kind === "face"),
  );
  const edges = body.edges.filter((edge) =>
    targets.some(
      (target) =>
        target.kind === "edge" &&
        (body.source
          ? body.source.sourceBodies?.includes(target.body) &&
            body.source.sourceEdges?.[Number(edge.id)]?.includes(target.edge)
          : target.body === body.id && target.edge === edge.id),
    ),
  );
  return [...faces.map((face) => face.vertices), ...edges.map((edge) => edge.points)];
}

export function selectedRevealFaces(
  body: SelectionBody,
  targets: readonly ModelingTarget[],
): SelectionBody["faces"] {
  return body.faces.filter((face) =>
    targets.some((target) => {
      if (target.kind !== "face" && target.kind !== "edge") return false;
      const source = body.source;
      if (!source)
        return (
          target.body === body.id &&
          (target.kind === "face" ? target.face === face.id : face.edges.includes(target.edge))
        );
      if (!source.sourceBodies?.includes(target.body)) return false;
      return target.kind === "face"
        ? !!source.sourceFaces?.[Number(face.id)]?.includes(target.face)
        : face.edges.some((edge) => source.sourceEdges?.[Number(edge)]?.includes(target.edge));
    }),
  );
}

/** Render-local slots let the reveal follow the mesh-first preview before metadata arrives. */
export function selectionPreviewGeometry(
  visual: VisualBody,
  accepted: readonly BodyGeometry[],
): SelectionBody {
  const previous = cache.get(visual);
  if (previous) return previous;
  const id = `visual-${THREE.MathUtils.generateUUID()}`;
  const sourceFaces = accepted.flatMap((body) => body.faces);
  const faces = visual.faces.map((vertices, i) => {
    const sources = sourceFaces.filter((face) => visual.sourceFaces?.[i]?.includes(face.id));
    return {
      id: `${i}`,
      vertices,
      edges: visual.edges.flatMap((_, j) =>
        visual.sourceEdges?.[j]?.some((edge) => sources.some((face) => face.edges.includes(edge)))
          ? [`${j}`]
          : [],
      ),
    };
  });
  const body = {
    id,
    faces,
    edges: visual.edges.map((points, i) => ({ id: `${i}`, points })),
    source: visual,
  };
  cache.set(visual, body);
  return body;
}
