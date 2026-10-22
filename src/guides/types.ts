/** Accepted guide definitions contain geometry identities and meaning, never cached positions. */
export type CurveFeature = "start" | "end" | "midpoint" | "circle-center";
export type GuideAnchor =
  | { kind: "sketch-curve"; sketch: string; curve: string; feature: CurveFeature }
  | { kind: "body-edge"; body: string; edge: string; feature: CurveFeature }
  | { kind: "body-junction"; body: string; edges: readonly string[] }
  | {
      kind: "body-faces";
      body: string;
      faces: readonly string[];
      feature: "area-center" | "bounds-center" | "circle-center";
    }
  | { kind: "body-center"; body: string; feature: "bounds-center" };
export interface GuidePoint {
  readonly id: string;
  readonly name: string;
  readonly hidden: boolean;
  readonly anchor: GuideAnchor;
}
export type GuideEdit =
  | { action: "create"; anchor: GuideAnchor; name?: string }
  | { action: "update"; id: string; name?: string; hidden?: boolean }
  | { action: "remove"; id: string }
  | { action: "remove-many"; ids: readonly string[] };
export const guideOwner = (anchor: GuideAnchor): string =>
  anchor.kind === "sketch-curve" ? anchor.sketch : anchor.body;
export function guideLabel(guide: GuidePoint): string {
  const meaning = guideMeaning(guide.anchor);
  return /^Guide point [1-9]\d*$/.test(guide.name) ? meaning : `${guide.name} · ${meaning}`;
}
export function guideMeaning(anchor: GuideAnchor): string {
  if (anchor.kind === "body-junction") return "Edge junction";
  if (anchor.kind === "body-center") return "Body bounding-box center";
  if (anchor.kind === "body-faces") {
    const owner = anchor.faces.length > 1 ? "Coplanar face group" : "Face";
    return `${owner} ${anchor.feature === "area-center" ? "area centroid" : anchor.feature === "bounds-center" ? "bounding-box center" : "circle center"}`;
  }
  const feature = {
    start: "start endpoint",
    end: "end endpoint",
    midpoint: "midpoint",
    "circle-center": "circle center",
  }[anchor.feature];
  return `${anchor.kind === "sketch-curve" ? "Sketch curve" : "Edge"} ${feature}`;
}
export function guideKey(anchor: GuideAnchor): string {
  if (anchor.kind === "sketch-curve")
    return JSON.stringify([anchor.kind, anchor.sketch, anchor.curve, anchor.feature]);
  if (anchor.kind === "body-edge")
    return JSON.stringify([anchor.kind, anchor.body, anchor.edge, anchor.feature]);
  if (anchor.kind === "body-junction")
    return JSON.stringify([anchor.kind, anchor.body, [...anchor.edges].sort()]);
  if (anchor.kind === "body-faces")
    return JSON.stringify([anchor.kind, anchor.body, [...anchor.faces].sort(), anchor.feature]);
  return JSON.stringify([anchor.kind, anchor.body, anchor.feature]);
}
