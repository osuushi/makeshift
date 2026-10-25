import type { DisplayDocument } from "../model/display-document.js";
import { unchangedDecoratorGeometry } from "./dependencies.js";
import { compatibleProfiles, ringRootLimit } from "./gear-fit-limits.js";
import { gearCylinder, gearFitFailure, groupEligible } from "./gear-group-geometry.js";
import { gearDimensions, gearSettings, involute, radians } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export interface GearFit {
  module: number;
  counts: number[];
  error: number;
}
type Fit = GearFit;

export function toothTipWidth(instance: DecoratorInstance, radius: number): number {
  const settings = gearSettings(instance.settings);
  const outward = (instance.state as { outward?: number } | undefined)?.outward === -1 ? -1 : 1;
  const d = gearDimensions(radius, settings, outward);
  if (d.tipRadius < d.baseRadius) return 0;
  const angle =
    d.halfWidth + involute(d.transversePressure) - involute(Math.acos(d.baseRadius / d.tipRadius));
  return 2 * d.tipRadius * Math.sin(outward > 0 ? angle : Math.PI / settings.teeth - angle);
}

function countCost(
  member: DecoratorInstance,
  diameter: number,
  count: number,
  module: number,
  rootLimit: number,
) {
  const settings = gearSettings({ ...member.settings, teeth: count });
  const outward = (member.state as { outward?: number } | undefined)?.outward === -1 ? -1 : 1;
  if (
    count < 6 ||
    count > 400 ||
    (outward > 0 && count < (2 * settings.addendum) / Math.sin(radians(settings.pressure)) ** 2)
  )
    return null;
  const error = module * count - diameter;
  if (Math.abs(error) > settings.diameterTolerance + 1e-8) return null;
  const d = gearDimensions((module * count) / 2, settings, outward);
  const angle = (radius: number) =>
    d.halfWidth +
    involute(d.transversePressure) -
    involute(Math.acos(d.baseRadius / Math.max(radius, d.baseRadius)));
  if (d.rootRadius > rootLimit + 1e-9) return null;
  if (
    Math.min(d.rootRadius, d.tipRadius) <= 0 ||
    (outward < 0 && d.tipRadius < d.baseRadius) ||
    angle(Math.max(d.rootRadius, d.tipRadius)) <= 1e-5 ||
    angle(Math.min(d.rootRadius, d.tipRadius)) >= Math.PI / count
  )
    return null;
  return toothTipWidth({ ...member, settings }, (module * count) / 2) >=
    settings.minimumTooth - 1e-9
    ? error * error
    : null;
}

function chooseFit(
  members: DecoratorInstance[],
  diameters: number[],
  rootLimits: number[],
): Fit | null {
  const settings = gearSettings(members[0].settings);
  const tolerance = settings.diameterTolerance;
  const maximum = Math.min(...diameters) / 6;
  const candidates = new Set([maximum]);
  for (const diameter of diameters) {
    for (let teeth = 6; teeth <= 400; teeth++) {
      for (const offset of [-tolerance, 0, tolerance]) {
        const module = (diameter + offset) / teeth;
        if (module > 0 && module <= maximum + 1e-9) candidates.add(module);
      }
    }
  }
  let best: Fit | null = null;
  for (const candidate of candidates) {
    const counts = diameters.map((d) => Math.round(d / candidate));
    const fit = evaluateFit(members, diameters, counts, rootLimits);
    if (
      fit &&
      compatibleProfiles(members, fit) &&
      (!best ||
        fit.error < best.error - 1e-12 ||
        (Math.abs(fit.error - best.error) <= 1e-12 && fit.module > best.module))
    )
      best = fit;
  }
  return best;
}

function evaluateFit(
  members: DecoratorInstance[],
  diameters: number[],
  counts: number[],
  rootLimits: number[],
): Fit | null {
  const settings = gearSettings(members[0].settings);
  let low = 0,
    high = Math.min(...diameters) / 6;
  for (const [i, count] of counts.entries()) {
    if (count < 6 || count > 400) return null;
    low = Math.max(low, (diameters[i] - settings.diameterTolerance) / count);
    high = Math.min(high, (diameters[i] + settings.diameterTolerance) / count);
  }
  if (low > high + 1e-10) return null;
  const ideal =
    counts.reduce((sum, n, i) => sum + n * diameters[i], 0) /
    counts.reduce((sum, n) => sum + n * n, 0);
  const module = Math.max(low, Math.min(high, ideal));
  if (module < low - 1e-9 || module > high + 1e-9) return null;
  for (const [i, count] of counts.entries()) {
    if (countCost(members[i], diameters[i], count, module, rootLimits[i]) === null) return null;
  }
  return {
    module,
    counts,
    error: diameters.reduce((sum, d, i) => sum + (module * counts[i] - d) ** 2, 0),
  };
}

/** Fit group profiles from support dimensions, never relative placement or contact. */
export function fitGearGroup(
  document: DisplayDocument,
  members: DecoratorInstance[],
): DecoratorInstance[] {
  const cleared = members.map((d) => ({
    ...d,
    problem: d.problem?.startsWith(gearFitFailure) ? undefined : d.problem,
  }));
  if (members.length === 1 && !groupEligible(document, cleared[0]))
    return cleared.map((d) => ({ ...d, gearPitchRadius: undefined }));
  if (cleared.some((d) => !groupEligible(document, d)))
    throw new Error(`${gearFitFailure}groups require spur cylinders with zero profile shift.`);
  const diameters = cleared.map((d) => 2 * (gearCylinder(document, d)?.radius ?? 0));
  const rootLimits = cleared.map((d) => ringRootLimit(document, d));
  let best: { fit: Fit; members: DecoratorInstance[] } | undefined;
  // Diameter fidelity wins. On a tie prefer full-depth teeth and the lower pressure angle.
  for (const addendum of [1, 0.9, 0.8, 0.75, 0.7, 0.65, 0.6]) {
    for (const pressure of [20, 25, 30]) {
      const candidates = cleared.map((d) => ({
        ...d,
        settings: { ...d.settings, addendum, pressure },
      }));
      const fit = chooseFit(candidates, diameters, rootLimits);
      if (fit && (!best || fit.error < best.fit.error - 1e-12)) best = { fit, members: candidates };
      if (best && best.fit.error < 1e-12) break;
    }
    if (best && best.fit.error < 1e-12) break;
  }
  if (!best)
    throw new Error(
      `${gearFitFailure}no tooth profile meets the printable width and clearance at these diameters. Reduce the minimum printable width or clearance, increase pitch diameter tolerance, or enlarge the pitch surfaces.`,
    );
  const { fit: chosen, members: fitted } = best;
  return fitted.map((d, i) => ({
    ...d,
    gearPitchRadius: (chosen.module * chosen.counts[i]) / 2,
    settings: { ...d.settings, teeth: chosen.counts[i] },
  }));
}

/** All members participate: a remote member can alter this gear's fitted profile. */
export function unchangedGearGroup(
  source: DisplayDocument | undefined,
  document: DisplayDocument,
  members: readonly DecoratorInstance[],
): boolean {
  if (!source || !members.length) return false;
  const previous = source.decorators?.filter((d) => d.gearGroup === members[0].gearGroup);
  try {
    return (
      JSON.stringify(previous) === JSON.stringify(members) &&
      members.every(
        (member) =>
          unchangedDecoratorGeometry(source, document, member, "faces") &&
          (source.bodies?.find((body) => body.id === member.faces[0].body) ===
            document.bodies?.find((body) => body.id === member.faces[0].body) ||
            ringRootLimit(source, member) === ringRootLimit(document, member)),
      )
    );
  } catch {
    // Lost supports still go through the ordinary repair diagnostics.
    return false;
  }
}

/** Refit affected groups in the same temporary candidate/Undo. */
export function refitGearGroups<Document extends DisplayDocument>(
  document: Document,
  source?: DisplayDocument,
): Document {
  if (!document.decorators?.some((d) => d.gearGroup)) return document;
  let decorators = document.decorators ?? [];
  const ids = new Set(decorators.flatMap((d) => (d.gearGroup ? [d.gearGroup] : [])));
  for (const id of ids) {
    const members = decorators.filter((d) => d.gearGroup === id);
    if (unchangedGearGroup(source, document, members)) continue;
    let fitted: DecoratorInstance[];
    try {
      fitted = fitGearGroup(document, members);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fitted = members.map((d) =>
        d.problem && !d.problem.startsWith(gearFitFailure)
          ? d
          : {
              ...d,
              problem: message.startsWith(gearFitFailure) ? message : gearFitFailure + message,
            },
      );
    }
    decorators = decorators.map((d) => fitted.find((f) => f.id === d.id) ?? d);
  }
  return JSON.stringify(decorators) === JSON.stringify(document.decorators)
    ? document
    : { ...document, decorators };
}
