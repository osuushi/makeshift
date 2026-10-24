import type { DisplayDocument } from "../model/display-document.js";
import { newId } from "../sketch/document.js";
import { fitGearGroup, toothTipWidth } from "./gear-group-fit.js";
import {
  gearContact,
  gearCylinder,
  gearFitFailure,
  gearGroupMembers,
  groupEligible,
} from "./gear-group-geometry.js";
import { gearSettings, radians } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export { refitGearGroups } from "./gear-group-fit.js";
export { gearContact, gearGroupMembers } from "./gear-group-geometry.js";

/** One accepted application can join selected gears and their contacting saved groups. */
export function matchGearApplication(
  document: DisplayDocument,
  decorators: readonly DecoratorInstance[],
  selected: ReadonlySet<string>,
  requestedGroup?: string,
  retainFailure = false,
): readonly DecoratorInstance[] {
  const eligible = decorators.filter((d) => groupEligible(document, d));
  if (requestedGroup && decorators.some((d) => selected.has(d.id) && !eligible.includes(d)))
    throw new Error("Gear groups require spur cylinders with zero profile shift");
  const members = eligible.filter(
    (d) => selected.has(d.id) || (requestedGroup && d.gearGroup === requestedGroup),
  );
  if (requestedGroup)
    members.sort(
      (a, b) => Number(b.gearGroup === requestedGroup) - Number(a.gearGroup === requestedGroup),
    );
  if (!members.length) {
    if (requestedGroup)
      throw new Error("Gear groups require spur cylinders with zero profile shift");
    return decorators;
  }
  if (requestedGroup && !decorators.some((d) => d.gearGroup === requestedGroup))
    throw new Error("Select an existing gear group");
  for (const member of members) {
    for (const candidate of eligible) {
      if (members.includes(candidate)) continue;
      if (
        (member.gearGroup && member.gearGroup === candidate.gearGroup) ||
        gearContact(document, member, candidate)
      )
        members.push(candidate);
    }
  }
  const id = requestedGroup ?? members.find((d) => d.gearGroup)?.gearGroup ?? newId();
  const settings = gearSettings(members[0].settings);
  const grouped = members.map((d) => ({
    ...d,
    gearGroup: id,
    settings: {
      ...d.settings,
      pressure: settings.pressure,
      module: settings.module,
      diameterTolerance: settings.diameterTolerance,
      minimumTooth: settings.minimumTooth,
      thinning: settings.rootClearance < 0 && settings.thinning === 0 ? 0.05 : settings.thinning,
      clearance: settings.clearance,
      rootClearance: settings.rootClearance < 0 ? 0.15 : settings.rootClearance,
    },
  }));
  let matched: DecoratorInstance[];
  try {
    matched = fitGearGroup(document, grouped);
  } catch (error) {
    // Keep valid printing limits even when no profile fits, so the next field
    // can repair the group. Schema errors still reject the numeric draft.
    if (requestedGroup && !retainFailure) throw error;
    const problem = error instanceof Error ? error.message : String(error);
    if (!problem.startsWith(gearFitFailure)) throw error;
    matched = grouped.map((d) => ({ ...d, problem }));
  }
  return decorators.map((d) => matched.find((m) => m.id === d.id) ?? d);
}

export function gearGroupProblem(
  document: DisplayDocument,
  instance: DecoratorInstance,
): string | null {
  if (!instance.gearGroup) return null;
  if (instance.problem?.startsWith(gearFitFailure)) return instance.problem;
  const members = gearGroupMembers(document, instance);
  if (members.length === 1 && !groupEligible(document, instance)) return null;
  if (members.some((d) => !groupEligible(document, d)))
    return "Gear groups require spur cylinders with zero profile shift";
  const modules = members.map(
    (d) =>
      (2 * (d.gearPitchRadius ?? gearCylinder(document, d)?.radius ?? 0)) /
      Number(d.settings.teeth),
  );
  for (const member of members) {
    const settings = gearSettings(member.settings);
    const radius = member.gearPitchRadius ?? gearCylinder(document, member)?.radius ?? 0;
    const target = gearCylinder(document, member)?.radius ?? 0;
    if (Math.abs(2 * (radius - target)) > settings.diameterTolerance + 1e-7)
      return `${gearFitFailure}the fitted pitch diameter exceeds the diameter tolerance.`;
    if (toothTipWidth(member, radius) < settings.minimumTooth - 1e-7)
      return `${gearFitFailure}tooth tips are narrower than the printable width limit.`;
  }
  if (
    modules.some((m) => Math.abs(m - modules[0]) > 1e-8) ||
    members.some((d) => d.settings.pressure !== members[0].settings.pressure)
  )
    return "Gear group tooth sizes differ. Select its faces and apply Gear to match them again.";
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const contact = gearContact(document, members[i], members[j]);
      if (!contact) continue;
      const a = gearSettings(members[i].settings),
        b = gearSettings(members[j].settings);
      const turns =
        (contact.meshSign * contact.orientation * a.teeth * (contact.a - radians(a.phase)) +
          b.teeth * (contact.b - radians(b.phase))) /
          (2 * Math.PI) -
        (contact.meshSign === 1 ? 0.5 : 0);
      if (Math.abs(turns - Math.round(turns)) > 1e-6)
        return "Gear group phases no longer mesh. Select its faces and apply Gear to align them again.";
    }
  }
  return null;
}
