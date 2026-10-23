import type { DisplayDocument } from "../model/display-document.js";
import { cylinderExtent } from "./cylinder.js";
import { gearFaces } from "./gear-faces.js";
import { gearSettings, radians } from "./gear-settings.js";
import type { DecoratorInstance } from "./types.js";

export function gearTolerance(
  document: DisplayDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  const faces = gearFaces(document, instance.faces),
    face = faces[0],
    settings = gearSettings(instance.settings);
  const radius =
    instance.gearPitchRadius ??
    face.cylinder?.radius ??
    (face.cone
      ? cylinderExtent(instance.frame, faces)[0] * Math.tan(radians(face.cone.semiAngle))
      : null);
  const module =
    radius === null
      ? settings.module
      : (2 * radius * Math.cos(radians(settings.helix))) / settings.teeth;
  if (quality === "preview") return Math.min(0.035, module / 12);
  const tolerance = Math.min(
    0.004,
    module / 100,
    settings.thinning > 0 ? settings.thinning / 8 : Infinity,
  );
  if (tolerance < 1e-5)
    throw new Error("The requested gear dimensions are below supported mesh precision");
  return tolerance;
}
