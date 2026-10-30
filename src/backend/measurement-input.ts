import type { MeasurementTarget } from "../model/measurement.js";
import { arcDomain } from "../sketch/arc-geometry.js";
import type { SketchDocument } from "../sketch/document.js";
import { profilesFor } from "../sketch/profiles.js";
import { boundary } from "./profile-boundary.js";

export function measurementInput(document: SketchDocument, selection: MeasurementTarget[]) {
  if (selection.length < 1 || selection.length > 2) throw new Error("Select one or two entities");
  const targets = selection.filter((t) => t.kind === "face" || t.kind === "edge");
  const profiles = selection.flatMap((t) => {
    if (t.kind !== "profile") return [];
    const sketch = document.sketches.find((s) => s.id === t.sketch);
    const profile = sketch && profilesFor(sketch).find((p) => p.key === t.profile);
    if (!sketch || !profile) throw new Error("Measurement region no longer exists");
    return [
      {
        outer: boundary(profile.outer, sketch.plane),
        holes: profile.holes.map((hole) => boundary(hole, sketch.plane)),
      },
    ];
  });
  const curves = selection.flatMap((t) => {
    if (t.kind !== "curve") return [];
    const sketch = document.sketches.find((s) => s.id === t.sketch);
    const curve = sketch?.curves.find((c) => c.id === t.curve);
    if (!sketch || !curve) throw new Error("Measurement curve no longer exists");
    const domain =
      curve.kind === "arc"
        ? arcDomain(curve)
        : { start: 0, sweep: curve.kind === "circle" ? Math.PI * 2 : 1 };
    return boundary(
      [{ curve, start: domain.start, end: domain.start + domain.sweep }],
      sketch.plane,
    );
  });
  const ids = new Set(targets.map((t) => t.body));
  return {
    kind: "measure" as const,
    targets,
    curves,
    profiles,
    planes: selection.flatMap((t) => {
      if (t.kind !== "plane") return [];
      const plane = document.constructionPlanes?.find((p) => p.id === t.plane);
      if (!plane) throw new Error("Measurement plane no longer exists");
      return [plane.frame];
    }),
    bodies: (document.bodies ?? []).filter((b) => ids.has(b.id)),
  };
}
