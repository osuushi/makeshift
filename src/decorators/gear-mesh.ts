import type { DisplayDocument } from "../model/display-document.js";
import { bevelMeshes } from "./bevel-mesh.js";
import { cylinderExtent, resolveFaces } from "./cylinder.js";
import { gearFaces } from "./gear-faces.js";
import { profileShell } from "./gear-loft.js";
import { gearTolerance } from "./gear-precision.js";
import { gearProfile } from "./gear-profile.js";
import { gearDimensions, gearSettings, radians } from "./gear-settings.js";
import { gearDiagnostics } from "./gear-support.js";
import { rackMeshes } from "./rack-mesh.js";
import { cylinderGrid, faceMask, radialShell } from "./radial-mesh.js";
import type { DecoratorInstance } from "./types.js";

export function gearMeshes(
  document: DisplayDocument,
  instance: DecoratorInstance,
  quality: "preview" | "export",
) {
  if (instance.problem) throw new Error(instance.problem);
  const error = gearDiagnostics(document, instance).find((d) => d.severity === "error");
  if (error) throw new Error(error.message);
  if (gearFaces(document, instance.faces)[0].plane) return rackMeshes(document, instance, quality);
  if (gearFaces(document, instance.faces)[0].cone) return bevelMeshes(document, instance, quality);
  const faces = resolveFaces(document.bodies ?? [], instance.faces);
  const body = document.bodies?.find((b) => b.id === instance.faces[0].body);
  if (!body) throw new Error("Gear body is missing");
  const { radius: supportRadius, outward } = faces[0].cylinder;
  const radius = instance.gearPitchRadius ?? supportRadius;
  const settings = gearSettings(instance.settings),
    d = gearDimensions(radius, settings, outward);
  const tolerance = gearTolerance(document, instance, quality);
  const low = Math.min(d.rootRadius, d.tipRadius, supportRadius) - tolerance * 8;
  const high = Math.max(d.rootRadius, d.tipRadius, supportRadius) + tolerance * 8;
  const bounds = cylinderExtent(instance.frame, faces);
  const twist = ((settings.hand === "right" ? 1 : -1) * Math.tan(radians(settings.helix))) / radius;
  const steps = Math.max(
    1,
    Math.ceil((Math.abs(twist) * (bounds[1] - bounds[0])) / Math.sqrt(tolerance / high)),
  );
  const profile = gearProfile(radius, settings, outward, tolerance / 4);
  if (profile.length * (steps + 1) > 400_000)
    throw new Error("Gear exceeds the mesh budget; reduce tooth count, helix or width");
  const segments = Math.max(64, Math.ceil(Math.PI / Math.acos(1 - tolerance / (2 * high))));
  if (segments > 100_000) throw new Error("Gear extent exceeds the mesh budget");
  const grid = cylinderGrid(segments, 1, bounds);
  const ring = (a: number, b: number) =>
    radialShell(
      instance.frame,
      grid.coords,
      grid.triangles,
      () => a,
      () => b,
    );
  const area = faces.reduce((sum, face) => sum + face.signature[2], 0);
  const complete = Math.abs(area - 2 * Math.PI * radius * (bounds[1] - bounds[0])) < 1e-6;
  const geometry = {
    tolerance,
    band: ring(low, high),
    masks: complete ? null : faces.map((face) => faceMask(instance.frame, [face], low, high)),
    outward,
    fill: profileShell(instance.frame, profile, bounds, steps, twist, radians(settings.phase)),
    referenceRemove:
      outward > 0
        ? ring(low, supportRadius + tolerance * 4)
        : ring(supportRadius - tolerance * 4, high),
    referenceAdd:
      outward > 0
        ? ring(low, supportRadius - tolerance * 4)
        : ring(supportRadius + tolerance * 4, high),
    envelope: ring(low + tolerance * 4, high - tolerance * 4),
  };
  return { geometry, faces, body };
}
