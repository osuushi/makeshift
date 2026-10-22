import type { DisplayDocument } from "../model/display-document.js";
import { featureEdges } from "../model/feature-edges.js";
import { type Vector, worldPoint } from "../sketch/planes.js";
import {
  areaCenter,
  boundsCenter,
  coplanarFaces,
  edgeCircle,
  edgeFeature,
  junction,
  near,
  sketchFeature,
} from "./geometry.js";
import type { GuideAnchor, GuidePoint } from "./types.js";

export function guidePosition(document: DisplayDocument, anchor: GuideAnchor): Vector | null {
  if (anchor.kind === "sketch-curve") {
    const sketch = document.sketches.find((s) => s.id === anchor.sketch);
    const curve = sketch?.curves.find((c) => c.id === anchor.curve);
    const point = curve && sketchFeature(curve, anchor.feature);
    return sketch && point ? worldPoint(sketch.plane, point) : null;
  }
  const body = document.bodies?.find((b) => b.id === anchor.body);
  if (!body) return null;
  if (anchor.kind === "body-center") return boundsCenter([body.bounds]);
  if (anchor.kind === "body-edge") {
    const edge = body.edges.find((e) => e.id === anchor.edge);
    return edge ? edgeFeature(edge, anchor.feature) : null;
  }
  if (anchor.kind === "body-junction") {
    const edges = body.edges.filter((e) => anchor.edges.includes(e.id));
    return edges.length === anchor.edges.length ? junction(edges) : null;
  }
  const faces = body.faces.filter((f) => anchor.faces.includes(f.id));
  if (!faces.length || faces.length !== anchor.faces.length) return null;
  if (faces.length > 1 && !coplanarFaces(faces)) return null;
  if (anchor.feature === "area-center") return areaCenter(faces);
  if (anchor.feature === "bounds-center") return boundsCenter(faces.map((f) => f.bounds ?? []));
  if (anchor.feature !== "circle-center" || !coplanarFaces(faces)) return null;
  const boundary = featureEdges(body).filter(
    (e) => faces.filter((f) => f.edges.includes(e.id)).length === 1,
  );
  const circles = boundary.map(edgeCircle);
  const first = circles[0];
  return first && circles.every((c) => c && near(c.center, first.center)) ? first.center : null;
}
export function resolvedGuides(document: DisplayDocument): { guide: GuidePoint; point: Vector }[] {
  return (document.guidePoints ?? []).flatMap((guide) => {
    const point = guidePosition(document, guide.anchor);
    return point?.every(Number.isFinite) ? [{ guide, point }] : [];
  });
}
