import type { DisplayDocument } from "../model/display-document.js";
import { cross, cylinderExtent, subtract } from "./cylinder.js";
import type { GearContactDistance, GearFit } from "./gear-contact-fit.js";
import { gearCylinder } from "./gear-group-geometry.js";
import { gearDimensions, gearSettings } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

/** Preserve printable material behind a ring's roots when an outer cylinder bounds it. */
export function ringRootLimit(document: DisplayDocument, member: DecoratorInstance): number {
  const cylinder = gearCylinder(document, member);
  if (!cylinder || cylinder.outward > 0) return Infinity;
  const body = document.bodies?.find((b) => b.id === member.faces[0].body);
  const selected = (body?.faces ?? []).filter((f) => member.faces.some((r) => r.face === f.id));
  const coverage = cylinderExtent(member.frame, selected);
  const radii = (body?.faces ?? []).flatMap((face) => {
    const outer = face.cylinder;
    if (!outer) return [];
    const extent = cylinderExtent(member.frame, [face]);
    return Math.min(extent[1], coverage[1]) - Math.max(extent[0], coverage[0]) > 1e-7 &&
      outer.outward > 0 &&
      outer.radius > cylinder.radius &&
      Math.hypot(...cross(outer.axis, cylinder.axis)) < 1e-7 &&
      Math.hypot(...cross(subtract(outer.origin, cylinder.origin), cylinder.axis)) < 1e-7
      ? [outer.radius]
      : [];
  });
  return Math.min(...radii) - gearSettings(member.settings).minimumTooth;
}

/** Bound the active involute contact path by the base circles and require overlap
 * between successive tooth contacts. This does not certify arbitrary assemblies. */
export function contactsFit(
  members: DecoratorInstance[],
  contacts: GearContactDistance[],
  fit: GearFit,
): boolean {
  return contacts.every((contact) => {
    const dimensions = [contact.a, contact.b].map((i) => {
      const member = members[i];
      const settings = gearSettings({ ...member.settings, teeth: fit.counts[i] });
      const outward = (member.state as { outward?: number } | undefined)?.outward === -1 ? -1 : 1;
      const d = gearDimensions((fit.module * fit.counts[i]) / 2, settings, outward);
      const pitchPath = d.pitchRadius * Math.sin(d.transversePressure);
      const tipPath = Math.sqrt(Math.max(0, d.tipRadius ** 2 - d.baseRadius ** 2));
      return { ...d, outward, pitchPath, path: outward * (tipPath - pitchPath) };
    });
    const [a, b] = dimensions;
    if (a.outward > 0 && b.path > a.pitchPath + 1e-8) return false;
    if (b.outward > 0 && a.path > b.pitchPath + 1e-8) return false;
    const basePitch = Math.PI * fit.module * Math.cos(a.transversePressure);
    return (a.path + b.path) / basePitch >= 1.1;
  });
}
