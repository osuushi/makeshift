import type { BodyGeometry, Face } from "../model/body.js";
import type { ExportMesh } from "../model/export-mesh.js";
import type { Vector } from "../sketch/planes.js";
import { trimAdjacentCylinders } from "./curved-domain.js";
import { cross, dot, subtract } from "./cylinder.js";
import type { MeshOperations, MeshSolid } from "./mesh-operations.js";
import { planarThreadBoundary } from "./thread-planar-boundary.js";

/** Bound each selected patch independently; disjoint axial patches must not clip each other. */
function trimAdjacentPlanes<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  solid: S,
  face: Face,
  body: BodyGeometry,
  axialBandEnds = false,
  coverPackedBoundary = false,
): S {
  let result = solid;
  for (const adjacent of body.faces) {
    if (!adjacent.plane || !adjacent.edges.some((edge) => face.edges.includes(edge))) continue;
    const normal = cross(adjacent.plane.u, adjacent.plane.v);
    // Recognized axial ends already bound the band. Cutting them again can
    // create coincident cap slivers after Float32 transport of a tilted rod.
    if (axialBandEnds && face.cylinder && Math.abs(dot(normal, face.cylinder.axis)) > 1 - 1e-7)
      continue;
    let low = Infinity,
      high = -Infinity;
    for (let i = 0; i < face.vertices.length; i += 3) {
      const distance = dot(
        normal,
        subtract(face.vertices.slice(i, i + 3) as Vector, adjacent.plane.origin),
      );
      low = Math.min(low, distance);
      high = Math.max(high, distance);
    }
    // A nonconvex domain can straddle an adjacent plane; its trimmed mask remains authoritative.
    if (low < -1e-7 && high > 1e-7) continue;
    const side = high > 1e-7 ? 1 : low < -1e-7 ? -1 : 0;
    if (!side) continue;
    const inward = normal.map((v) => v * side) as Vector;
    let offset = dot(inward, subtract(adjacent.plane.origin, scope.origin));
    if (coverPackedBoundary) {
      // The body is transported as Float32. Include its actual packed flat,
      // otherwise a tilted plane can leave a thin sheet outside the cutter.
      const analytic = offset;
      let rounding = 0;
      for (let i = 0; i < adjacent.vertices.length; i += 3) {
        const packed = adjacent.vertices
          .slice(i, i + 3)
          .map((value, axis) => Math.fround(value - scope.origin[axis])) as Vector;
        offset = Math.min(offset, dot(inward, packed));
        rounding = Math.max(rounding, Math.abs(dot(inward, packed) - analytic));
      }
      // Leave room for the Boolean's own rounding when the transported face
      // is no longer exactly planar. Exactly representable planes stay exact.
      offset -= 4 * rounding;
    }
    result = scope.keep(result.trimByPlane(inward, offset));
  }
  return result;
}

export function threadDomain<S extends MeshSolid<S>>(
  scope: MeshOperations<S>,
  body: BodyGeometry,
  faces: readonly Face[],
  geometry: {
    band: ExportMesh;
    masks: ExportMesh[] | null;
    tolerance: number;
    extendPlanarCuts?: boolean;
    readonly planarCutBand?: ExportMesh;
  },
  removal = false,
): S {
  const band = scope.from(geometry.band);
  if (!geometry.masks) return band;
  const patches = geometry.masks.map((mesh, i) => {
    const planar = geometry.extendPlanarCuts && !!planarThreadBoundary(body, faces[i]);
    const expanded = planar && faces.length === 1 ? geometry.planarCutBand : undefined;
    return trimAdjacentCylinders(
      scope,
      trimAdjacentPlanes(
        scope,
        expanded
          ? scope.from(expanded)
          : planar
            ? band
            : scope.keep(scope.from(mesh).intersect(band)),
        faces[i],
        body,
        !!expanded,
        planar && removal,
      ),
      faces[i],
      body,
      geometry.tolerance,
    );
  });
  return patches.slice(1).reduce((all, patch) => scope.keep(all.add(patch)), patches[0]);
}
