import type { ModelingTarget } from "../sketch/model-selection-state.js";
import type { Vector } from "../sketch/planes.js";
import type { BodyGeometry } from "./body.js";
import {
  edgeLoopGraph,
  type LoopGraph,
  type OpenChain,
  openEdgeChains,
} from "./edge-loop-graph.js";
import {
  addMoments,
  emptyMoments,
  loopScatter,
  loopScore,
  loopScoreBound,
} from "./edge-loop-score.js";

export interface EdgeLoopCompletion {
  body: string;
  seed: string[];
  added: string[];
  ends: [Vector, Vector];
  neighbors: [Vector, Vector];
  exhaustive: boolean;
}
const searchLimit = 20000;

function returnGraph(graph: LoopGraph, chain: OpenChain) {
  const seed = new Set(chain.edges);
  return graph.incident.map((edges, vertex) =>
    edges.flatMap((index) => {
      const edge = graph.edges[index];
      const next = edge.a === vertex ? edge.b : edge.a;
      return seed.has(index) || (chain.vertices.has(next) && next !== chain.end)
        ? []
        : [{ index, next, length: edge.moments.length }];
    }),
  );
}

/** Shortest length to the goal supplies both an initial solution and a search bound. */
function distancesToEnd(adjacency: ReturnType<typeof returnGraph>, end: number) {
  const incoming = adjacency.map(() => [] as { from: number; index: number; length: number }[]);
  adjacency.forEach((steps, from) => {
    for (const step of steps) incoming[step.next].push({ from, ...step });
  });
  const distances = adjacency.map(() => Infinity);
  const next = new Map<number, { vertex: number; edge: number }>();
  const pending = new Set([end]);
  distances[end] = 0;
  while (pending.size) {
    let vertex = -1;
    for (const v of pending) if (vertex < 0 || distances[v] < distances[vertex]) vertex = v;
    if (!Number.isFinite(distances[vertex])) break;
    pending.delete(vertex);
    for (const step of incoming[vertex]) {
      const distance = distances[vertex] + step.length;
      if (distance >= distances[step.from]) continue;
      distances[step.from] = distance;
      pending.add(step.from);
      next.set(step.from, { vertex, edge: step.index });
    }
  }
  return { distances, next };
}

function closeChain(graph: LoopGraph, chain: OpenChain) {
  const adjacency = returnGraph(graph, chain);
  const { distances, next } = distancesToEnd(adjacency, chain.end);
  if (!next.has(chain.start)) return null;
  const seed = chain.edges.reduce(
    (sum, i) => addMoments(sum, graph.edges[i].moments),
    emptyMoments(),
  );
  const maximumWidth = loopScatter(
    graph.edges.reduce((sum, edge) => addMoments(sum, edge.moments), emptyMoments()),
  )[1];
  let best: number[] = [],
    moments = seed;
  for (let v = chain.start; v !== chain.end; ) {
    const step = next.get(v);
    if (!step) return null;
    best.push(step.edge);
    moments = addMoments(moments, graph.edges[step.edge].moments);
    v = step.vertex;
  }
  let score = loopScore(moments, seed.length),
    visited = 0;
  const stack = [
    { vertex: chain.start, path: [] as number[], seen: new Set(chain.vertices), moments: seed },
  ];
  while (stack.length && visited++ < searchLimit) {
    const state = stack.pop();
    if (!state) break;
    if (
      loopScoreBound(state.moments, distances[state.vertex], seed.length, maximumWidth) >=
      score - 1e-8
    )
      continue;
    const steps = adjacency[state.vertex]
      .map((step) => {
        const sum = addMoments(state.moments, graph.edges[step.index].moments);
        return { ...step, sum, priority: loopScore(sum, seed.length) };
      })
      .sort((a, b) => b.priority - a.priority);
    for (const step of steps) {
      const sum = step.sum;
      const path = [...state.path, step.index];
      if (step.next === chain.end) {
        const candidate = loopScore(sum, seed.length);
        if (candidate < score - 1e-8) {
          best = path;
          score = candidate;
        }
      } else if (!state.seen.has(step.next)) {
        stack.push({
          vertex: step.next,
          path,
          seen: new Set([...state.seen, step.next]),
          moments: sum,
        });
      }
    }
  }
  return { added: best.map((i) => graph.edges[i].edge.id), exhaustive: !stack.length };
}

export function edgeLoopCompletions(
  body: BodyGeometry,
  selected: ReadonlySet<string>,
): EdgeLoopCompletion[] {
  const graph = edgeLoopGraph(body);
  return openEdgeChains(graph, selected).flatMap((chain) => {
    const result = closeChain(graph, chain);
    if (!result) return [];
    const ends: [Vector, Vector] = [graph.vertices[chain.start], graph.vertices[chain.end]];
    const neighbors = [chain.start, chain.end].map((vertex) => {
      const edge =
        graph.edges[
          chain.edges.find((i) => {
            const e = graph.edges[i];
            return e.a === vertex || e.b === vertex;
          }) as number
        ];
      const points = edge.edge.points;
      return (edge.a === vertex ? points.slice(3, 6) : points.slice(-6, -3)) as Vector;
    }) as [Vector, Vector];
    return [
      {
        body: body.id,
        seed: chain.edges.map((i) => graph.edges[i].edge.id),
        ends,
        neighbors,
        ...result,
      },
    ];
  });
}

export function completedLoopSelection(
  targets: ModelingTarget[],
  completion: EdgeLoopCompletion,
): ModelingTarget[] {
  const existing = new Set(
    targets.flatMap((t) => (t.kind === "edge" && t.body === completion.body ? [t.edge] : [])),
  );
  return [
    ...targets,
    ...completion.added
      .filter((id) => !existing.has(id))
      .map((edge) => ({
        kind: "edge" as const,
        body: completion.body,
        edge,
      })),
  ];
}
