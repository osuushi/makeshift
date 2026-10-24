import type { DisplayDocument } from "../model/display-document.js";
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
