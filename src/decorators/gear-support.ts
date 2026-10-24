import type { DisplayDocument } from "../model/display-document.js";
import { bevelFrame, bevelProfile } from "./bevel-profile.js";
import { cross, cylinderExtent, cylinderFrame, dot, resolveFaces, subtract } from "./cylinder.js";
import { gearFaces, sameGearSupport } from "./gear-faces.js";
import { gearGroupProblem, refitGearGroups } from "./gear-group.js";
import { gearDimensions, gearSettings, involute, radians } from "./gear-settings.js";
import type { DecoratorDiagnostic } from "./javascript-hooks.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

/** Refit shared dimensions before validating each member's ordinary support contract. */
export function continueGearGroups<Document extends DisplayDocument>(document: Document): Document {
  const fitted = refitGearGroups(document);
  let changed = false;
  const decorators = fitted.decorators?.map((instance) => {
    if (!instance.gearGroup || instance.problem) return instance;
    const error = gearDiagnostics(fitted, instance).find((d) => d.severity === "error");
    if (!error) return instance;
    changed = true;
    return { ...instance, problem: `Decorator continuation needs attention: ${error.message}` };
  });
  return changed ? { ...fitted, decorators } : fitted;
}

export function partitionGears(document: DisplayDocument, instance: DecoratorInstance) {
  const faces = gearFaces(document, instance.faces);
  const groups: { faces: FaceReference[] }[] = [];
  for (let i = 0; i < faces.length; i++) {
    const ref = instance.faces[i];
    const group = groups.find((group) => {
      const index = instance.faces.findIndex(
        (f) => f.body === group.faces[0].body && f.face === group.faces[0].face,
      );
      return ref.body === group.faces[0].body && sameGearSupport(faces[index], faces[i]);
    });
    if (group) group.faces.push(ref);
    else groups.push({ faces: [ref] });
  }
  return groups.map((group) => {
    const face = gearFaces(document, group.faces)[0];
    const state = {
      support: face.cone ? "cone" : face.plane ? "plane" : "cylinder",
      outward: face.cylinder?.outward ?? face.cone?.outward ?? 1,
    };
    const previous = instance.state as typeof state | undefined;
    if (previous && (previous.support !== state.support || previous.outward !== state.outward))
      throw new Error("The gear support type or material side changed. Reassign the gear.");
    return { ...group, state };
  });
}

export function gearFrame(document: DisplayDocument, faces: readonly FaceReference[]) {
  const face = gearFaces(document, faces)[0];
  if (face.plane) return face.plane;
  if (face.cone) return bevelFrame(face.cone);
  if (!face.cylinder) throw new Error("Missing gear support");
  return cylinderFrame(face.cylinder);
}

export function gearPlacement(document: DisplayDocument, references: readonly FaceReference[]) {
  const frame = gearFrame(document, references),
    faces = gearFaces(document, references);
  return { frame, axialReference: faces[0].cone ? cylinderExtent(frame, faces) : undefined };
}

export function inspectGear(document: DisplayDocument, instance: DecoratorInstance) {
  const faces = gearFaces(document, instance.faces),
    cone = faces[0].cone;
  if (cone) {
    const reference = instance.axialReference ?? cylinderExtent(instance.frame, faces);
    const radius = reference[1] * Math.tan(radians(cone.semiAngle));
    const profile = bevelProfile(
      cone,
      gearSettings(instance.settings),
      0.035,
      reference[1],
      reference[1],
    );
    return {
      ...gearDimensions(radius, gearSettings(instance.settings), cone.outward),
      baseRadius: reference[1] * Math.tan(profile.baseAngle),
      tipRadius: reference[1] * (cone.outward > 0 ? profile.high : profile.low),
      rootRadius: reference[1] * (cone.outward > 0 ? profile.low : profile.high),
      referenceAxial: reference[1],
      pitchConeAngle: cone.semiAngle,
      baseConeAngle: (profile.baseAngle * 180) / Math.PI,
      support: { origin: cone.apex, axis: cone.axis, radius, outward: cone.outward },
      frame: instance.frame,
    };
  }
  const cylinder = resolveFaces(document.bodies ?? [], instance.faces)[0].cylinder;
  return {
    ...gearDimensions(
      instance.gearPitchRadius ?? cylinder.radius,
      gearSettings(instance.settings),
      cylinder.outward,
    ),
    support: cylinder,
    frame: instance.frame,
  };
}

export function gearDiagnostics(
  document: DisplayDocument,
  instance: DecoratorInstance,
): DecoratorDiagnostic[] {
  try {
    if (instance.version !== 1) throw new Error("Unsupported Gear version");
    const settings = gearSettings(instance.settings);
    const groupProblem = gearGroupProblem(document, instance);
    if (groupProblem) throw new Error(groupProblem);
    if (partitionGears(document, instance).length !== 1)
      throw new Error("Gear faces must share one pitch surface and material side");
    if (gearFaces(document, instance.faces)[0].plane) {
      const plane = gearFaces(document, instance.faces)[0].plane;
      const normal = cross(instance.frame.u, instance.frame.v);
      if (
        !plane ||
        dot(normal, cross(plane.u, plane.v)) < 1 - 1e-10 ||
        Math.abs(dot(normal, subtract(plane.origin, instance.frame.origin))) > 1e-7
      )
        throw new Error("The rack pitch plane moved independently. Reassign the gear.");
      const half =
        (Math.PI * settings.module) / 4 +
        settings.shift * settings.module * Math.tan(radians(settings.pressure)) -
        settings.thinning / 2;
      if (half <= settings.module * (1 + settings.shift) * Math.tan(radians(settings.pressure)))
        throw new Error("Rack tooth tips are pointed; reduce thinning or profile shift");
      if (
        half +
          settings.module *
            (1 + settings.clearance - settings.shift) *
            Math.tan(radians(settings.pressure)) >=
        (Math.PI * settings.module) / 2
      )
        throw new Error("Rack roots overlap; reduce clearance or pressure angle");
      return [];
    }
    const faces = gearFaces(document, instance.faces),
      cone = faces[0].cone;
    if (cone) {
      if (
        dot(cross(instance.frame.u, instance.frame.v), cone.axis) < 1 - 1e-10 ||
        Math.hypot(...subtract(instance.frame.origin, cone.apex)) > 1e-7
      )
        throw new Error("The bevel pitch cone moved independently. Reassign the gear.");
      const bounds = cylinderExtent(instance.frame, faces);
      if (bounds[0] <= 1e-5) throw new Error("Bevel coverage must stop before the cone apex");
      bevelProfile(cone, settings, 0.01, bounds[1], instance.axialReference?.[1]);
      return [];
    }
    const { support, baseRadius, tipRadius, rootRadius, halfWidth, transversePressure } =
      inspectGear(document, instance);
    const axis = cross(instance.frame.u, instance.frame.v);
    if (
      Math.hypot(...cross(axis, support.axis)) > 1e-7 ||
      Math.hypot(...cross(subtract(instance.frame.origin, support.origin), axis)) > 1e-7
    )
      throw new Error("The gear support moved independently. Reassign the gear.");
    if (Math.min(rootRadius, tipRadius) <= 0) throw new Error("Gear teeth reach the pitch axis");
    if (support.outward < 0 && tipRadius < baseRadius)
      throw new Error(
        "Internal tooth tips reach below the base circle; increase tooth count or pressure angle",
      );
    const minimumTeeth =
      (2 * (1 - settings.shift) * Math.cos(radians(settings.helix)) ** 3) /
      Math.sin(radians(settings.pressure)) ** 2;
    if (support.outward > 0 && settings.teeth < minimumTeeth)
      throw new Error(
        "This gear requires undercut teeth; increase tooth count, pressure angle or profile shift",
      );
    const outer = Math.max(tipRadius, rootRadius);
    const angle =
      halfWidth + involute(transversePressure) - involute(Math.acos(baseRadius / outer));
    const innerAngle =
      halfWidth +
      involute(transversePressure) -
      involute(Math.acos(baseRadius / Math.max(baseRadius, Math.min(tipRadius, rootRadius))));
    if (angle <= 1e-5 || innerAngle >= Math.PI / settings.teeth)
      throw new Error(
        "Gear tooth thickness produces pointed or overlapping teeth; reduce thinning or profile shift",
      );
    return [];
  } catch (error) {
    return [
      {
        severity: "error",
        message: error instanceof Error ? error.message : String(error),
        faces: [...instance.faces],
      },
    ];
  }
}
