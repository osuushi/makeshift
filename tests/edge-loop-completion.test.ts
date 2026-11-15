import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Body, BodyGeometry, Edge } from "../src/model/body.js";
import { completedLoopSelection, edgeLoopCompletions } from "../src/model/edge-loop-completion.js";
import {
  addMoments,
  edgeMoments,
  emptyMoments,
  loopScore,
  planeError,
} from "../src/model/edge-loop-score.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import type { Vector } from "../src/sketch/planes.js";

function edge(id: string, ...points: Vector[]): Edge {
  return {
    id,
    curve: null,
    signature: [],
    points: points.flat(),
    landmarks: {
      start: points[0],
      end: points.at(-1) as Vector,
      midpoint: points[Math.floor(points.length / 2)],
      closed: false,
    },
  };
}
function body(edges: Edge[]): BodyGeometry {
  return { id: "body", center: [0, 0, 0], bounds: [], volume: 0, faces: [], edges };
}
const a: Vector = [0, 0, 0],
  b: Vector = [10, 0, 0];
const seed = edge("seed", a, [0, 10, 0], [10, 10, 0], b);
const fixture = JSON.parse(readFileSync("tests/fixtures/close-edge-loop.json", "utf8")) as {
  document: { bodies: Body[] };
  selection: ModelingTarget[];
};

test("captured rim chooses the complete smallest planar loop, not the fillet detour", () => {
  const solid = fixture.document.bodies[0];
  const target = fixture.selection[0];
  assert.equal(target.kind, "edge");
  if (target.kind !== "edge") return;
  const completions = edgeLoopCompletions(solid, new Set([target.edge]));
  assert.equal(completions.length, 1);
  assert.ok(completions[0].exhaustive);
  const expected = solid.edges.filter((e) =>
    e.points.every((v, i) => i % 3 !== 2 || Math.abs(v - 27) < 1e-6),
  );
  assert.equal(expected.length, 4);
  assert.deepEqual(
    new Set([target.edge, ...completions[0].added]),
    new Set(expected.map((e) => e.id)),
  );
});

test("length breaks planar ambiguity, but meaningful bends lose to a longer planar return", () => {
  const straight = edge("short", a, b);
  const long = edge("long", a, [5, -4, 0], b);
  assert.deepEqual(edgeLoopCompletions(body([seed, long, straight]), new Set(["seed"]))[0].added, [
    "short",
  ]);
  const bent = edge("bent", a, [5, 0, 3], b);
  assert.deepEqual(edgeLoopCompletions(body([seed, bent, long]), new Set(["seed"]))[0].added, [
    "long",
  ]);
  const slight = edge("slight", a, [5, 0, 0.01], b);
  assert.deepEqual(edgeLoopCompletions(body([seed, slight, long]), new Set(["seed"]))[0].added, [
    "slight",
  ]);
  assert.deepEqual(edgeLoopCompletions(body([seed, bent]), new Set(["seed"]))[0].added, ["bent"]);
});

test("separate chains complete independently; closed, branched and dead-end selections have no button", () => {
  const close = edge("close", a, b);
  const other = edge("other", [30, 0, 0], [30, 10, 0], [40, 0, 0]);
  const otherClose = edge("other-close", [30, 0, 0], [40, 0, 0]);
  const solid = body([seed, close, other, otherClose]);
  assert.equal(edgeLoopCompletions(solid, new Set(["seed", "other"])).length, 2);
  assert.equal(edgeLoopCompletions(solid, new Set(["seed", "close"])).length, 0);
  assert.equal(edgeLoopCompletions(body([seed]), new Set(["seed"])).length, 0);
  const branch = edge("branch", a, [0, -10, 0]);
  assert.equal(
    edgeLoopCompletions(body([seed, close, branch]), new Set(["seed", "close", "branch"])).length,
    0,
  );
});

test("a return never crosses an interior vertex of the selected chain", () => {
  const mid: Vector = [5, 10, 0];
  const solid = body([
    edge("s1", a, mid),
    edge("s2", mid, b),
    edge("shortcut1", a, [1, 1, 0], mid),
    edge("shortcut2", mid, [9, 1, 0], b),
    edge("return", a, [5, -2, 0], b),
  ]);
  assert.deepEqual(edgeLoopCompletions(solid, new Set(["s1", "s2"]))[0].added, ["return"]);
});

test("completion preserves ordered unrelated targets and existing selected edges", () => {
  const completion = edgeLoopCompletions(body([seed, edge("close", a, b)]), new Set(["seed"]))[0];
  const targets: ModelingTarget[] = [
    { kind: "face", body: "other-body", face: "face" },
    { kind: "edge", body: "body", edge: "seed", point: a },
  ];
  const result = completedLoopSelection(targets, completion);
  assert.deepEqual(result.slice(0, 2), targets);
  assert.deepEqual(result[2], { kind: "edge", body: "body", edge: "close" });
  assert.deepEqual(completedLoopSelection(result, completion), result);
});

test("plane regression is invariant to collinear subdivision, rotation, translation and scale", () => {
  const points: Vector[] = [a, [0, 10, 0], [10, 10, 0], b, [5, 0, 2], a];
  const original = edgeMoments(edge("loop", ...points), a);
  assert.ok(planeError(original) > 0);
  const subdivided = points.flatMap((p, i): Vector[] =>
    i === 0 ? [p] : [p.map((v, k) => (v + points[i - 1][k]) / 2) as Vector, p],
  );
  assert.ok(
    Math.abs(planeError(original) - planeError(edgeMoments(edge("loop", ...subdivided), a))) < 1e-8,
  );
  const transform = (p: Vector): Vector => [
    1000 + 3 * (0.6 * p[0] - 0.8 * p[1]),
    -500 + 3 * (0.64 * p[0] + 0.48 * p[1] - 0.6 * p[2]),
    77 + 3 * (0.48 * p[0] + 0.36 * p[1] + 0.8 * p[2]),
  ];
  const changed = edgeMoments(edge("loop", ...points.map(transform)), transform(a));
  assert.ok(Math.abs(loopScore(changed, 30) / loopScore(original, 10) - 3) < 1e-8);
  const sum = [seed, edge("close", a, b)].reduce(
    (m, e) => addMoments(m, edgeMoments(e, a)),
    emptyMoments(),
  );
  assert.ok(planeError(sum) < 1e-8);
});

test("old sampled endpoints and small endpoint roundoff retain connectivity", () => {
  const approximate = {
    ...edge("close", [0, 0, 0.000001], [10, 0, 0.000001]),
    landmarks: undefined,
  };
  const result = edgeLoopCompletions(body([seed, approximate]), new Set(["seed"]));
  assert.deepEqual(result[0].added, ["close"]);
  const circle = {
    ...edge("circle", a, [10, 10, 0], a),
    landmarks: {
      start: a,
      end: a,
      midpoint: b,
      closed: true,
    },
  };
  assert.deepEqual(edgeLoopCompletions(body([circle]), new Set(["circle"])), []);
});
