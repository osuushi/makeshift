import type { DisplayDocument } from "../model/display-document.js";
import {
  type GearContactDistance as Contact,
  type GearFit as Fit,
  fitContactingGears,
} from "./gear-contact-fit.js";
import { gearContact, gearCylinder, gearFitFailure, groupEligible } from "./gear-group-geometry.js";
import { alignGearPhases } from "./gear-group-phase.js";
import { gearDimensions, gearSettings, involute, radians } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export function toothTipWidth(instance: DecoratorInstance, radius: number): number {
  const settings = gearSettings(instance.settings);
  const d = gearDimensions(radius, settings, 1);
  const angle =
    d.halfWidth + involute(d.transversePressure) - involute(Math.acos(d.baseRadius / d.tipRadius));
  return 2 * d.tipRadius * Math.sin(angle);
}

function chooseFit(members: DecoratorInstance[], diameters: number[], contacts: Contact[]): Fit {
  const settings = gearSettings(members[0].settings);
  const tolerance = settings.diameterTolerance;
  const candidates = new Set([settings.module]);
  for (const diameter of diameters) {
    for (let teeth = 6; teeth <= 400; teeth++) {
      for (const offset of [-tolerance, 0, tolerance]) {
        const module = (diameter + offset) / teeth;
        if (module > 0 && module <= settings.module + 1e-9) candidates.add(module);
      }
    }
  }
  let best: Fit | null = contacts.length
    ? fitContactingGears(diameters, contacts, settings.module, tolerance, (i, count, module) => {
        const local = gearSettings(members[i].settings);
        if (count < Math.ceil(2 / Math.sin(radians(local.pressure)) ** 2) || count > 400)
          return null;
        const error = module * count - diameters[i];
        if (Math.abs(error) > tolerance + 1e-8) return null;
        const gear = { ...members[i], settings: { ...local, teeth: count } };
        return toothTipWidth(gear, (module * count) / 2) >= settings.minimumTooth - 1e-9
          ? error * error
          : null;
      })
    : null;
  for (const candidate of contacts.length ? [] : candidates) {
    const counts = diameters.map((d) => Math.round(d / candidate));
    const fit = evaluateFit(members, diameters, contacts, counts);
    if (
      fit &&
      (!best ||
        fit.error < best.error - 1e-12 ||
        (Math.abs(fit.error - best.error) <= 1e-12 && fit.module > best.module))
    )
      best = fit;
  }
  if (!best)
    throw new Error(
      `${gearFitFailure}no shared tooth size satisfies the diameter tolerance, minimum tooth tip width and 400-tooth limit. Increase diameter tolerance or maximum module, or lower the printable width limit.`,
    );
  return best;
}

function evaluateFit(
  members: DecoratorInstance[],
  diameters: number[],
  contacts: Contact[],
  counts: number[],
): Fit | null {
  const settings = gearSettings(members[0].settings);
  let low = 0,
    high = settings.module;
  for (const [i, count] of counts.entries()) {
    const s = gearSettings(members[i].settings);
    if (count < Math.ceil(2 / Math.sin(radians(s.pressure)) ** 2) || count > 400) return null;
    low = Math.max(low, (diameters[i] - settings.diameterTolerance) / count);
    high = Math.min(high, (diameters[i] + settings.diameterTolerance) / count);
  }
  if (low > high + 1e-10) return null;
  const ideal =
    counts.reduce((sum, n, i) => sum + n * diameters[i], 0) /
    counts.reduce((sum, n) => sum + n * n, 0);
  const module = contacts.length
    ? (2 * contacts[0].distance) / (counts[contacts[0].a] + counts[contacts[0].b])
    : Math.max(low, Math.min(high, ideal));
  if (module < low - 1e-9 || module > high + 1e-9) return null;
  if (
    contacts.some((c) => Math.abs((module * (counts[c.a] + counts[c.b])) / 2 - c.distance) > 1e-7)
  )
    return null;
  for (const [i, count] of counts.entries()) {
    const instance = { ...members[i], settings: { ...members[i].settings, teeth: count } };
    if (toothTipWidth(instance, (module * count) / 2) < settings.minimumTooth - 1e-9) return null;
  }
  return {
    module,
    counts,
    error: diameters.reduce((sum, d, i) => sum + (module * counts[i] - d) ** 2, 0),
  };
}

/** Fit only decorator geometry. Existing pitch contacts retain their current axis spacing. */
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
    throw new Error(
      `${gearFitFailure}groups require external spur cylinders with zero profile shift.`,
    );
  const diameters = cleared.map((d) => 2 * (gearCylinder(document, d)?.radius ?? 0));
  const contacts: Contact[] = [];
  for (let a = 0; a < cleared.length; a++) {
    for (let b = a + 1; b < cleared.length; b++) {
      const contact = gearContact(document, cleared[a], cleared[b]);
      if (contact) contacts.push({ a, b, distance: contact.distance });
    }
  }
  const fit = chooseFit(cleared, diameters, contacts);
  return alignGearPhases(
    document,
    cleared.map((d, i) => ({
      ...d,
      gearPitchRadius: (fit.module * fit.counts[i]) / 2,
      settings: { ...d.settings, teeth: fit.counts[i] },
    })),
  );
}

/** Geometry continuation refits the whole group in the same temporary candidate/Undo. */
export function refitGearGroups<Document extends DisplayDocument>(document: Document): Document {
  if (!document.decorators?.some((d) => d.gearGroup)) return document;
  let decorators = document.decorators ?? [];
  const ids = new Set(decorators.flatMap((d) => (d.gearGroup ? [d.gearGroup] : [])));
  for (const id of ids) {
    const members = decorators.filter((d) => d.gearGroup === id);
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
