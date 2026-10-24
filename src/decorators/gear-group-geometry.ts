import type { DisplayDocument } from "../model/display-document.js";
import type { Vector } from "../sketch/planes.js";
import { cross, cylinderExtent, dot, subtract } from "./cylinder.js";
import { gearFaces } from "./gear-faces.js";
import { gearDefinition, gearSettings } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export const gearFitFailure = "Gear group cannot fit: ";

export function gearGroupMembers(document: DisplayDocument, instance: DecoratorInstance) {
  return (document.decorators ?? []).filter(
    (d) => d.id === instance.id || (instance.gearGroup && d.gearGroup === instance.gearGroup),
  );
}

export function gearCylinder(document: DisplayDocument, instance: DecoratorInstance) {
  return gearFaces(document, instance.faces)[0].cylinder;
}

export function groupEligible(document: DisplayDocument, instance: DecoratorInstance): boolean {
  if (
    instance.definition !== gearDefinition ||
    (instance.problem && !instance.problem.startsWith(gearFitFailure))
  )
    return false;
  try {
    const cylinder = gearCylinder(document, instance),
      settings = gearSettings(instance.settings);
    return !!cylinder && settings.helix === 0 && settings.shift === 0;
  } catch {
    return false;
  }
}

/** Only tangent parallel pitch cylinders with overlapping tooth coverage are neighbors. */
export function gearContact(document: DisplayDocument, a: DecoratorInstance, b: DecoratorInstance) {
  const ca = gearCylinder(document, a),
    cb = gearCylinder(document, b);
  if (!ca || !cb || (ca.outward < 0 && cb.outward < 0)) return null;
  const internal = ca.outward !== cb.outward;
  const ra = a.gearPitchRadius ?? ca.radius,
    rb = b.gearPitchRadius ?? cb.radius;
  if (internal && (ca.outward < 0 ? ra <= rb : rb <= ra)) return null;
  const axis = cross(a.frame.u, a.frame.v);
  if (Math.hypot(...cross(axis, cb.axis)) > 1e-7) return null;
  const delta = subtract(cb.origin, ca.origin);
  const axial = dot(delta, axis);
  const radial = delta.map((n, i) => n - axial * axis[i]) as Vector;
  const targetDistance = internal ? Math.abs(ca.radius - cb.radius) : ca.radius + cb.radius;
  const fittedDistance = internal ? Math.abs(ra - rb) : ra + rb;
  const distance = Math.hypot(...radial);
  if (Math.min(Math.abs(distance - targetDistance), Math.abs(distance - fittedDistance)) > 1e-6)
    return null;
  const af = gearFaces(document, a.faces),
    bf = gearFaces(document, b.faces);
  const ab = cylinderExtent(a.frame, af),
    bb = cylinderExtent(a.frame, bf);
  if (Math.min(ab[1], bb[1]) - Math.max(ab[0], bb[0]) < 1e-7) return null;
  return {
    distance: Math.hypot(...radial),
    signA: ca.outward,
    signB: cb.outward,
    meshSign: internal ? -1 : 1,
    a: Math.atan2(cb.outward * dot(radial, a.frame.v), cb.outward * dot(radial, a.frame.u)),
    b: Math.atan2(-ca.outward * dot(radial, b.frame.v), -ca.outward * dot(radial, b.frame.u)),
    orientation: dot(axis, cross(b.frame.u, b.frame.v)) > 0 ? 1 : -1,
  };
}
