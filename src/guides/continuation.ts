import type { BodyGeometry } from "../model/body.js";
import { topologyOrigins } from "../model/body-correspondence.js";
import type { DisplayDocument } from "../model/display-document.js";
import { newId, type SketchDocument } from "../sketch/document.js";
import { guidePosition } from "./evaluate.js";
import { coplanarFaces, edgeFeature, junction, near } from "./geometry.js";
import type { GuideAnchor, GuidePoint } from "./types.js";

function successors(body: BodyGeometry, kind: "faces" | "edges", ids: readonly string[]): string[] {
  const origins = topologyOrigins.get(body)?.[kind];
  return body[kind]
    .filter(
      (item) => ids.includes(item.id) || origins?.get(item.id)?.some((id) => ids.includes(id)),
    )
    .map((item) => item.id);
}
function continuedAnchor(
  source: DisplayDocument,
  body: BodyGeometry,
  guide: GuidePoint,
): GuideAnchor | null {
  const anchor = guide.anchor;
  if (anchor.kind === "sketch-curve") return null;
  const document = { ...source, bodies: [body] };
  if (anchor.kind === "body-center") return { ...anchor, body: body.id };
  if (anchor.kind === "body-faces") {
    const ids = successors(body, "faces", anchor.faces);
    if (!ids.length) return null;
    const faces = body.faces.filter((f) => ids.includes(f.id));
    const group = { ...anchor, body: body.id, faces: ids };
    if ((faces.length === 1 || coplanarFaces(faces)) && guidePosition(document, group))
      return group;
    return (
      ids.map((id) => ({ ...group, faces: [id] })).find((a) => guidePosition(document, a)) ?? null
    );
  }
  if (anchor.kind === "body-junction") {
    const groups = anchor.edges.map((id) => successors(body, "edges", [id]));
    if (groups.some((ids) => !ids.length)) return null;
    const first = body.edges.filter((e) => groups[0].includes(e.id));
    for (const edge of first)
      for (const feature of ["start", "end"] as const) {
        const point = edgeFeature(edge, feature);
        if (!point) continue;
        const ids = groups.map(
          (group) =>
            body.edges.find(
              (e) =>
                group.includes(e.id) &&
                (["start", "end"] as const).some((f) => {
                  const p = edgeFeature(e, f);
                  return p && near(point, p);
                }),
            )?.id,
        );
        if (ids.some((id) => !id)) continue;
        const edges = body.edges.filter((e) => ids.includes(e.id));
        if (junction(edges)) return { ...anchor, body: body.id, edges: edges.map((e) => e.id) };
      }
    return null;
  }
  const ids = successors(body, "edges", [anchor.edge]);
  const old = guidePosition(source, anchor);
  const choices = ids.flatMap((edge): GuideAnchor[] => {
    const a = { ...anchor, body: body.id, edge };
    // A split endpoint must remain the old endpoint; do not jump to the cut.
    if (ids.length > 1 && old && (a.feature === "start" || a.feature === "end"))
      return (["start", "end"] as const)
        .map((feature) => ({ ...a, feature }))
        .filter((candidate) => {
          const p = guidePosition(document, candidate);
          return p && near(p, old);
        });
    return guidePosition(document, a) ? [a] : [];
  });
  return choices[0] ?? null;
}
/** Consume immediate ancestry once. No nearest-body or unrelated-topology guessing. */
export function continueGuides<T extends DisplayDocument>(source: SketchDocument, candidate: T): T {
  if (!source.guidePoints?.length || source.bodies === candidate.bodies) return candidate;
  const guides: GuidePoint[] = [];
  for (const guide of source.guidePoints) {
    if (guide.anchor.kind === "sketch-curve") {
      guides.push(guide);
      continue;
    }
    const bodyId = guide.anchor.body;
    const old = source.bodies?.find((b) => b.id === bodyId);
    if (!old) continue;
    const owners = (candidate.bodies ?? []).filter(
      (b) =>
        b.id === old.id ||
        (!source.bodies?.includes(b as typeof old) &&
          topologyOrigins.get(b)?.bodies.includes(old.id)),
    );
    let kept = false;
    for (const body of owners) {
      if (body === old) {
        guides.push(guide);
        kept = true;
        continue;
      }
      const anchor = continuedAnchor(source, body, guide);
      if (!anchor || !guidePosition(candidate, anchor)) continue;
      const copy = !!topologyOrigins.get(body)?.copy || owners.includes(old);
      if (kept && !copy) continue;
      guides.push({ ...guide, id: copy ? newId() : guide.id, anchor });
      if (!copy) kept = true;
    }
  }
  return { ...candidate, guidePoints: guides };
}
