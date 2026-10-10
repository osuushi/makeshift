import { knurlDefinition } from "../decorators/builtins.js";
import { gearManifest } from "../decorators/gear-settings.js";
import { knurlFields } from "../decorators/knurl-settings.js";
import { threadDefinition, threadFields } from "../decorators/thread-settings.js";
import type { Body } from "../model/body.js";
import type { MeasurementTarget } from "../model/measurement.js";
import { arcCircle } from "../sketch/arc-geometry.js";
import type { Curve, Sketch, SketchDocument } from "../sketch/document.js";
import { profilesFor } from "../sketch/profiles.js";
import type { InspectionTarget, InspectionView } from "./inspection-protocol.js";

const required = <T>(value: T | undefined): T => {
  if (!value) throw new Error("That geometry is no longer present in the drawing.");
  return value;
};
export function bodySummary(body: Body) {
  return {
    kind: "body" as const,
    id: body.id,
    volume: body.volume,
    center: body.center,
    centerKind: "bounding-box midpoint",
    bounds: body.bounds,
    boundsKind: "conservative kernel bounding box",
    dimensions: body.bounds.slice(3).map((max, i) => max - body.bounds[i]),
    faces: body.faces.map((f) => f.id),
    edges: body.edges.map((e) => e.id),
  };
}
function curveSummary(curve: Curve) {
  if (curve.kind === "segment")
    return { ...curve, length: Math.hypot(curve.b.x - curve.a.x, curve.b.y - curve.a.y) };
  if (curve.kind === "circle")
    return { ...curve, diameter: 2 * curve.radius, length: 2 * Math.PI * curve.radius };
  if (curve.kind === "arc") {
    const circle = arcCircle(curve),
      sweep = 4 * Math.atan(curve.bulge);
    return {
      ...curve,
      center: circle.center,
      radius: circle.radius,
      sweepRadians: sweep,
      length: Math.abs(sweep) * circle.radius,
    };
  }
  return { ...curve };
}
export function targetGeometry(document: SketchDocument, target: InspectionTarget): unknown {
  if (target.kind === "tagged-group")
    return required(document.taggedGroups?.find((g) => g.id === target.taggedGroup));
  if (target.kind === "plane")
    return {
      kind: "plane",
      ...required(document.constructionPlanes?.find((p) => p.id === target.plane)),
    };
  if ("body" in target) {
    const body = required(document.bodies?.find((b) => b.id === target.body));
    if (target.kind === "body") return bodySummary(body);
    if (target.kind === "face") {
      const face = required(body.faces.find((f) => f.id === target.face));
      return {
        kind: "face",
        id: face.id,
        body: body.id,
        edges: face.edges,
        surface: face.plane ? "plane" : face.cylinder ? "cylinder" : face.cone ? "cone" : "other",
        plane: face.plane,
        cylinder: face.cylinder ?? null,
        cone: face.cone ?? null,
        blend: face.blend ?? null,
        decorators: (document.decorators ?? []).filter((d) =>
          d.faces.some((f) => f.body === body.id && f.face === face.id),
        ),
      };
    }
    const edge = required(body.edges.find((e) => e.id === target.edge));
    return {
      kind: "edge",
      id: edge.id,
      body: body.id,
      curve: edge.curve,
      faces: body.faces.filter((f) => f.edges.includes(edge.id)).map((f) => f.id),
    };
  }
  const sketch = required(document.sketches.find((s) => s.id === target.sketch));
  if (target.kind === "sketch")
    return {
      kind: "sketch",
      ...sketch,
      curves: sketch.curves.map(curveSummary),
      profiles: profileSummary(sketch),
    };
  if (target.kind === "profile")
    return { ...target, note: "Derived region key, valid for current sketch geometry only." };
  if ("curve" in target) {
    const curve = required(sketch.curves.find((c) => c.id === target.curve));
    return {
      target,
      plane: sketch.plane,
      curve: curveSummary(curve),
      note:
        target.kind === "curve"
          ? "Whole curve selected."
          : "Point target only; owning curve is context, not whole-curve selection.",
    };
  }
  const group = required(sketch.groups.find((g) => g.id === target.group));
  return {
    target,
    plane: sketch.plane,
    group,
    curves: group.members.map((id) =>
      curveSummary(required(sketch.curves.find((c) => c.id === id))),
    ),
  };
}
export function findInspectionTarget(document: SketchDocument, id: string): InspectionTarget {
  if (document.taggedGroups?.some((g) => g.id === id))
    return { kind: "tagged-group", taggedGroup: id };
  if (document.constructionPlanes?.some((p) => p.id === id)) return { kind: "plane", plane: id };
  for (const body of document.bodies ?? []) {
    if (body.id === id) return { kind: "body", body: id };
    if (body.faces.some((f) => f.id === id)) return { kind: "face", body: body.id, face: id };
    if (body.edges.some((e) => e.id === id)) return { kind: "edge", body: body.id, edge: id };
  }
  for (const sketch of document.sketches) {
    if (sketch.id === id) return { kind: "sketch", sketch: id };
    if (sketch.curves.some((c) => c.id === id))
      return { kind: "curve", sketch: sketch.id, curve: id };
    if (sketch.groups.some((g) => g.id === id))
      return { kind: "group", sketch: sketch.id, group: id };
  }
  throw new Error(
    "Unknown geometry ID. Run makeshift inspect or makeshift selection for current IDs.",
  );
}
export function inspectionOverview(document: SketchDocument, view: InspectionView) {
  return {
    units: document.units,
    taggedGroups: document.taggedGroups ?? [],
    decorators: document.decorators ?? [],
    decoratorDefinitions: document.decoratorDefinitions ?? [],
    builtinDecorators: [
      { id: threadDefinition, version: 1, name: "Threads", fields: threadFields },
      gearManifest,
      { id: knurlDefinition, version: 1, name: "Knurling", fields: knurlFields },
    ],
    constructionPlanes: (document.constructionPlanes ?? []).map((p) => ({
      kind: "plane",
      ...p,
      visible: !view.hidden.includes(p.id),
    })),
    bodies: (document.bodies ?? []).map((body) => ({
      ...bodySummary(body),
      visible: view.bodiesVisible && !view.hidden.includes(body.id),
    })),
    sketches: document.sketches.map((s) => ({
      kind: "sketch",
      id: s.id,
      plane: s.plane,
      profiles: profileSummary(s),
      visible: !view.hidden.includes(s.id),
      curves: s.curves.map((c) => ({ id: c.id, kind: c.kind })),
      constraints: s.constraints.length,
      groups: s.groups.map((g) => ({ id: g.id, kind: g.kind })),
    })),
  };
}
export function measurable(targets: InspectionTarget[]): MeasurementTarget[] {
  if (targets.length < 1 || targets.length > 2) return [];
  return targets.every((t) => ["face", "edge", "profile", "curve"].includes(t.kind))
    ? (targets as MeasurementTarget[])
    : [];
}

/** Current source keys plus enough boundary context to choose among closed regions. */
function profileSummary(sketch: Sketch) {
  const spans = (boundary: ReturnType<typeof profilesFor>[number]["outer"]) =>
    boundary.map((s) => ({ curve: s.curve.id, start: s.start, end: s.end }));
  return profilesFor(sketch).map((p) => ({
    sketch: sketch.id,
    profile: p.key,
    area: p.area,
    outer: spans(p.outer),
    holes: p.holes.map(spans),
  }));
}
