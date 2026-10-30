import type { BodyGeometry } from "../model/body.js";
import { cross, cylinderExtent, resolveFaces, subtract } from "./cylinder.js";
import { threadReference } from "./thread-extent.js";
import { threadFlatClearance } from "./thread-flat-clearance.js";
import { coarseMetric, threadDepth, threadSettings } from "./thread-settings.js";
import type { DecoratorInstance, FaceReference } from "./types.js";

export interface ThreadWarning {
  message: string;
  faces: readonly FaceReference[];
}

export function threadInformation(bodies: readonly BodyGeometry[], instance: DecoratorInstance) {
  const faces = resolveFaces(bodies, instance.faces);
  const cylinder = faces[0].cylinder;
  const settings = threadSettings(instance.settings);
  const diameter = cylinder.radius * 2;
  const description = `Reference Ø${Number(diameter.toPrecision(10))} mm · ${settings.cut === "rod" ? "rod major" : "rod minor"} diameter${settings.preset === "metric" && !coarseMetric(diameter).listed ? " · nonstandard diameter" : ""}`;
  const body = bodies.find((b) => b.id === instance.faces[0].body);
  const warnings: ThreadWarning[] = [];
  if (!body) return { description, warnings };
  const depth = threadDepth(settings);
  const extent = threadReference(bodies, instance);
  const low = extent[0] + settings.start,
    high = extent[1] - settings.end;
  const blockedFlats: FaceReference[] = [];
  for (const adjacent of body.faces) {
    if (faces.some((f) => f.id === adjacent.id)) continue;
    const other = adjacent.cylinder;
    if (
      other &&
      other.outward !== cylinder.outward &&
      Math.hypot(...cross(other.axis, cylinder.axis)) < 1e-7 &&
      Math.hypot(...cross(subtract(other.origin, cylinder.origin), cylinder.axis)) < 1e-7
    ) {
      const range = cylinderExtent(instance.frame, [adjacent]);
      const removal =
        cylinder.outward === 1
          ? settings.cut === "rod"
            ? depth
            : 0
          : (settings.cut === "hole" ? depth : 0) + settings.clearance;
      const wall = (cylinder.radius - other.radius) * cylinder.outward;
      if (wall > 0 && removal >= wall && range[1] > low && range[0] < high)
        warnings.push({
          message: "Thread depth or hole relief may pierce this nearby wall.",
          faces: [...instance.faces, { body: body.id, face: adjacent.id }],
        });
    }
    if (
      cylinder.outward !== -1 ||
      !adjacent.plane ||
      !adjacent.edges.some((edge) => faces.some((f) => f.edges.includes(edge)))
    )
      continue;
    const envelope = cylinder.radius + (settings.cut === "hole" ? depth : 0);
    const axis = cross(instance.frame.u, instance.frame.v);
    if (threadFlatClearance(adjacent, instance.frame.origin, axis, low, high) < envelope - 1e-7)
      blockedFlats.push({ body: body.id, face: adjacent.id });
  }
  if (blockedFlats.length)
    warnings.push({
      message:
        "Adjacent flat material interrupts the circular passage; a round mating thread may not turn here.",
      faces: [...instance.faces, ...blockedFlats],
    });
  return { description, warnings };
}
