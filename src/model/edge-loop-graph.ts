import type { Vector } from "../sketch/planes.js";
import type { BodyGeometry, Edge } from "./body.js";
import { edgeMoments, type LoopMoments } from "./edge-loop-score.js";

export interface LoopEdge {
  edge: Edge;
  a: number;
  b: number;
  moments: LoopMoments;
}
export interface LoopGraph {
  vertices: Vector[];
  edges: LoopEdge[];
  incident: number[][];
}
export interface OpenChain {
  edges: number[];
  vertices: Set<number>;
  start: number;
  end: number;
}

/** Landmarks join within the endpoint tolerance; IDs still identify selected edges. */
export function edgeLoopGraph(body: BodyGeometry): LoopGraph {
  const vertices: Vector[] = [],
    incident: number[][] = [],
    edges: LoopEdge[] = [];
  const tolerance = 1e-5;
  const buckets = new Map<string, number[]>();
  const vertex = (point: Vector): number => {
    const cell = point.map((v) => Math.floor(v / tolerance));
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          const neighbors = buckets.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`) ?? [];
          for (const index of neighbors)
            if (Math.hypot(...vertices[index].map((v, i) => v - point[i])) < tolerance)
              return index;
        }
    const index = vertices.length;
    const key = cell.join(",");
    buckets.set(key, [...(buckets.get(key) ?? []), index]);
    vertices.push(point);
    incident.push([]);
    return index;
  };
  for (const edge of body.edges) {
    if (edge.landmarks?.closed || edge.points.length < 6) continue;
    const start = edge.landmarks?.start ?? (edge.points.slice(0, 3) as Vector);
    const end = edge.landmarks?.end ?? (edge.points.slice(-3) as Vector);
    const a = vertex(start),
      b = vertex(end);
    if (a === b) continue;
    const moments = edgeMoments(edge, body.center);
    if (moments.length <= 0) continue;
    incident[a].push(edges.length);
    incident[b].push(edges.length);
    edges.push({ edge, a, b, moments });
  }
  return { vertices, edges, incident };
}

/** A connected selection must be a simple open chain; branches have no unique ends. */
export function openEdgeChains(graph: LoopGraph, selected: ReadonlySet<string>): OpenChain[] {
  const pending = new Set(graph.edges.flatMap((e, i) => (selected.has(e.edge.id) ? [i] : [])));
  const chains: OpenChain[] = [];
  while (pending.size) {
    const stack = [pending.values().next().value as number];
    const edges: number[] = [],
      degree = new Map<number, number>();
    while (stack.length) {
      const index = stack.pop() as number;
      if (!pending.delete(index)) continue;
      edges.push(index);
      const edge = graph.edges[index];
      for (const vertex of [edge.a, edge.b]) {
        degree.set(vertex, (degree.get(vertex) ?? 0) + 1);
        stack.push(...graph.incident[vertex].filter((i) => pending.has(i)));
      }
    }
    const ends = [...degree].filter(([, count]) => count === 1).map(([v]) => v);
    if (ends.length === 2 && [...degree.values()].every((count) => count <= 2))
      chains.push({ edges, vertices: new Set(degree.keys()), start: ends[0], end: ends[1] });
  }
  return chains;
}
