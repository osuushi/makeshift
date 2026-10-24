import type { BodyGeometry, Face } from "../model/body.js";
import type { Vector } from "../sketch/planes.js";
import { cross, dot, subtract } from "./cylinder.js";

/** Recognize a cylinder trimmed by one longitudinal flat and two axial ends.
 * Its cutting domain follows those planes rather than the original edge angles.
 * Check the area too: planes alone must not fill a missing or unselected patch. */
export function planarThreadBoundary(body: BodyGeometry, face: Face): Face[] | null {
  const cylinder = face.cylinder;
  if (cylinder?.outward !== 1) return null;
  const covered = new Set<string>();
  const ends: number[] = [];
  let flat: { normal: Vector; offset: number } | undefined;
  const flatFaces: Face[] = [];
  for (const adjacent of body.faces) {
    const shared = adjacent.edges.filter((edge) => face.edges.includes(edge));
    if (adjacent.id === face.id || !shared.length) continue;
    if (!adjacent.plane) return null;
    const normal = cross(adjacent.plane.u, adjacent.plane.v);
    const alignment = dot(normal, cylinder.axis);
    const offset = dot(normal, subtract(adjacent.plane.origin, cylinder.origin));
    if (Math.abs(alignment) > 1 - 1e-7) {
      const end = offset / alignment;
      if (!ends.some((value) => Math.abs(value - end) < 1e-7)) ends.push(end);
    } else if (Math.abs(alignment) < 1e-7) {
      let low = Infinity,
        high = -Infinity;
      for (let i = 0; i < face.vertices.length; i += 3) {
        const distance = dot(
          normal,
          subtract(face.vertices.slice(i, i + 3) as Vector, cylinder.origin),
        );
        low = Math.min(low, distance - offset);
        high = Math.max(high, distance - offset);
      }
      if (low < -1e-7 && high > 1e-7) return null;
      const side = high > 1e-7 ? 1 : low < -1e-7 ? -1 : 0;
      if (!side) return null;
      const inward = normal.map((value) => value * side) as Vector;
      if (
        flat &&
        (dot(flat.normal, inward) < 1 - 1e-7 || Math.abs(flat.offset - offset * side) > 1e-7)
      )
        return null;
      flat = { normal: inward, offset: offset * side };
      flatFaces.push(adjacent);
    } else return null;
    for (const edge of shared) covered.add(edge);
  }
  // Repeated occurrences are the cylinder's parameter seam, not a trim boundary.
  for (const edge of face.edges)
    if (!covered.has(edge) && face.edges.filter((id) => id === edge).length !== 2) return null;
  if (!flat || ends.length !== 2) return null;
  const ratio = flat.offset / cylinder.radius;
  if (Math.abs(ratio) >= 1) return null;
  const expected = 2 * Math.acos(ratio) * cylinder.radius * Math.abs(ends[1] - ends[0]);
  return Math.abs(face.signature[2] - expected) <= 1e-7 * Math.max(1, expected) ? flatFaces : null;
}
