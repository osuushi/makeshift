import type { BodyGeometry, Edge } from "../model/body.js";
import { featureEdges } from "../model/feature-edges.js";
import type { Vector } from "../sketch/planes.js";
import { edgeFeature, near } from "./geometry.js";

type Endpoint = { edge: Edge; point: Vector; order: number };
const indexes = new WeakMap<BodyGeometry, Map<string, Endpoint[]>>();
const cell = (point: Vector) => point.map((v) => Math.floor(v / 1e-7));

/** Immutable current geometry owns this derived index; IDs alone never reuse it. */
function endpointIndex(body: BodyGeometry): Map<string, Endpoint[]> {
  let index = indexes.get(body);
  if (index) return index;
  index = new Map();
  for (const [order, edge] of featureEdges(body).entries()) {
    for (const feature of ["start", "end"] as const) {
      const point = edgeFeature(edge, feature);
      if (!point) continue;
      const key = cell(point).join(",");
      const entries = index.get(key) ?? [];
      entries.push({ edge, point, order });
      index.set(key, entries);
    }
  }
  indexes.set(body, index);
  return index;
}

/** Neighboring cells only narrow the search; the existing exact tolerance decides incidence. */
export function incidentEdges(body: BodyGeometry, point: Vector): Edge[] {
  const index = endpointIndex(body),
    [x, y, z] = cell(point),
    matches = new Map<number, Edge>();
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++)
        for (const entry of index.get(`${x + dx},${y + dy},${z + dz}`) ?? [])
          if (near(point, entry.point)) matches.set(entry.order, entry.edge);
  // Preserve body edge order, including the first edge used to resolve a junction.
  return [...matches].sort(([a], [b]) => a - b).map(([, edge]) => edge);
}
