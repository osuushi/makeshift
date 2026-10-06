import type { Body, Extrusion, LiftSource, Revolution } from "../model/body.js";
import { exactBodies } from "../model/exact-body.js";
import { type Loft, validateLoft } from "../model/loft.js";
import type { PathSweep } from "../model/path-sweep.js";
import type { SketchDocument } from "../sketch/document.js";
import { type PlaneFrame, parallelNormals, planeNormal, type Vector } from "../sketch/planes.js";
import { profilesFor } from "../sketch/profiles.js";
import { boundary } from "./profile-boundary.js";

function profileInput(
  document: SketchDocument,
  sources: LiftSource[],
  bodies: readonly Body[],
  parallel = true,
) {
  let direction: Vector | undefined;
  const profiles = sources.map((source) => {
    let frame: PlaneFrame;
    let profile:
      | { face: string }
      | { outer: ReturnType<typeof boundary>; holes: ReturnType<typeof boundary>[] };
    if ("face" in source) {
      const face = bodies.flatMap((body) => body.faces).find((face) => face.id === source.face);
      if (!face?.plane) throw new Error("Select a planar face");
      frame = face.plane;
      profile = source;
    } else {
      const sketch = document.sketches.find((sketch) => sketch.id === source.sketch);
      if (!sketch) throw new Error("Source sketch does not exist");
      const region = profilesFor(sketch).find((profile) => profile.key === source.profile);
      if (!region)
        throw new Error(
          "Profile key does not match a current closed region. Inspect the source sketch for current profile keys.",
        );
      frame = sketch.plane;
      profile = {
        outer: boundary(region.outer, frame),
        holes: region.holes.map((hole) => boundary(hole, frame)),
      };
    }
    const normal = planeNormal(frame);
    if (parallel && direction && !parallelNormals(direction, normal))
      throw new Error("Selected profiles must have parallel planes");
    direction ??= normal;
    return parallel ? profile : { ...profile, frame };
  });
  if (!direction) throw new Error("Select a closed profile or planar face");
  return {
    normal: direction,
    profiles,
    bodies: exactBodies(bodies),
  };
}

export function kernelInput(
  document: SketchDocument,
  extrusion: Extrusion,
  bodies: readonly Body[],
) {
  const faces = extrusion.sources.flatMap((source) =>
    "face" in source
      ? bodies.flatMap((body) => body.faces).filter((face) => face.id === source.face)
      : [],
  );
  const normalExtrusion = faces.some((face) => !face.plane);
  if (
    normalExtrusion &&
    (faces.length !== extrusion.sources.length ||
      extrusion.symmetric ||
      (extrusion.draft?.value ?? 0) !== 0 ||
      (extrusion.twist?.angle ?? 0) !== 0)
  )
    throw new Error("Normal face extrusion requires solid faces without draft, twist or symmetry");
  return {
    ...(normalExtrusion
      ? { normal: [0, 0, 1] as Vector, profiles: extrusion.sources, bodies: exactBodies(bodies) }
      : profileInput(document, extrusion.sources, bodies)),
    normalExtrusion,
    kind: "extrude" as const,
    mode: extrusion.mode,
    distance: extrusion.distance,
    symmetric: extrusion.symmetric,
    draft: extrusion.draft,
    twist: extrusion.twist,
    targets: extrusion.targets,
    eligibleTargets: extrusion.eligibleTargets,
  };
}

export function revolveInput(
  document: SketchDocument,
  operation: Revolution,
  bodies: readonly Body[],
) {
  return {
    ...profileInput(document, operation.sources, bodies),
    kind: "revolve" as const,
    mode: operation.mode,
    targets: operation.targets,
    eligibleTargets: operation.eligibleTargets,
    axis: operation.axis,
    angle: operation.angle,
    height: operation.height,
  };
}

export function pathSweepInput(
  document: SketchDocument,
  operation: PathSweep,
  bodies: readonly Body[],
) {
  return {
    ...profileInput(document, operation.sources, bodies),
    kind: "path-sweep" as const,
    path: operation.path,
    mode: operation.mode,
    targets: operation.targets,
    eligibleTargets: operation.eligibleTargets,
  };
}

export function loftInput(document: SketchDocument, operation: Loft, bodies: readonly Body[]) {
  validateLoft(operation);
  return {
    ...profileInput(document, operation.sources, bodies, false),
    kind: "loft" as const,
    ruled: operation.ruled,
    alignment: operation.alignment,
    mode: operation.mode,
    targets: operation.targets,
    eligibleTargets: operation.eligibleTargets,
  };
}
