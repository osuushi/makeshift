import type { BodyGeometry } from "../model/body.js";
import type { DisplayDocument } from "../model/display-document.js";
import { featureEdges } from "../model/feature-edges.js";
import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Vector } from "../sketch/planes.js";
import { guidePosition } from "./evaluate.js";
import { edgeFeature, junction, near } from "./geometry.js";
import { type CurveFeature, type GuideAnchor, guideKey, guideMeaning } from "./types.js";

export interface GuideCandidate {
  anchor: GuideAnchor;
  point: Vector;
  label: string;
}
const features: CurveFeature[] = ["start", "end", "midpoint", "circle-center"];
function bodyCandidates(body: BodyGeometry, target: ModelingTarget): GuideAnchor[] {
  const edges = featureEdges(body).filter(
    (e) =>
      target.kind === "body" ||
      (target.kind === "edge" && target.edge === e.id) ||
      (target.kind === "face" &&
        body.faces.find((f) => f.id === target.face)?.edges.includes(e.id)),
  );
  const anchors: GuideAnchor[] = [];
  for (const edge of edges)
    for (const feature of features) {
      const point = edgeFeature(edge, feature);
      if (!point) continue;
      if (feature === "start" || feature === "end") {
        const incident = featureEdges(body).filter((e) =>
          (["start", "end"] as const).some((f) => {
            const p = edgeFeature(e, f);
            return p && near(point, p);
          }),
        );
        if (junction(incident)) {
          anchors.push({
            kind: "body-junction",
            body: body.id,
            edges: incident.map((e) => e.id).sort(),
          });
          continue;
        }
      }
      anchors.push({ kind: "body-edge", body: body.id, edge: edge.id, feature });
    }
  for (const face of body.faces.filter(
    (f) => target.kind === "body" || (target.kind === "face" && f.id === target.face),
  ))
    for (const feature of ["area-center", "bounds-center", "circle-center"] as const)
      anchors.push({ kind: "body-faces", body: body.id, faces: [face.id], feature });
  if (target.kind === "body")
    anchors.push({ kind: "body-center", body: body.id, feature: "bounds-center" });
  return anchors;
}
export function guideCandidates(
  document: DisplayDocument,
  targets: readonly ModelingTarget[],
  sketchCurves?: { sketch: string; curves: readonly string[] },
): GuideCandidate[] {
  const anchors: GuideAnchor[] = [];
  const curves = (sketch: string, ids?: readonly string[]) => {
    for (const curve of document.sketches.find((s) => s.id === sketch)?.curves ?? [])
      if (!ids || ids.includes(curve.id))
        for (const feature of features)
          anchors.push({ kind: "sketch-curve", sketch, curve: curve.id, feature });
  };
  if (sketchCurves) curves(sketchCurves.sketch, sketchCurves.curves);
  for (const target of targets) {
    if (target.kind === "sketch") curves(target.sketch);
    else if (target.kind === "profile")
      curves(
        target.sketch,
        [target.profile.outer, ...target.profile.holes].flatMap((loop) =>
          loop.map((span) => span.curve.id),
        ),
      );
    else {
      const body = document.bodies?.find((b) => b.id === target.body);
      if (body) anchors.push(...bodyCandidates(body, target));
    }
  }
  const selectedFaces = targets.filter((t) => t.kind === "face");
  if (selectedFaces.length > 1 && selectedFaces.every((t) => t.body === selectedFaces[0].body))
    for (const feature of ["area-center", "bounds-center"] as const)
      anchors.push({
        kind: "body-faces",
        body: selectedFaces[0].body,
        faces: selectedFaces.map((t) => t.face),
        feature,
      });
  const seen = new Set<string>();
  return anchors.flatMap((anchor) => {
    const key = guideKey(anchor),
      point = guidePosition(document, anchor);
    if (!point?.every(Number.isFinite) || seen.has(key)) return [];
    seen.add(key);
    return [{ anchor, point, label: guideMeaning(anchor) }];
  });
}
export function commonGuide(candidate: GuideCandidate): boolean {
  return (
    candidate.anchor.kind === "body-junction" ||
    ((candidate.anchor.kind === "body-edge" || candidate.anchor.kind === "sketch-curve") &&
      candidate.anchor.feature !== "circle-center")
  );
}
