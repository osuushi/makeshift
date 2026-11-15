import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Body, Edge } from "../src/model/body.js";
import { edgeLoopCompletions } from "../src/model/edge-loop-completion.js";
import {
  addMoments,
  edgeMoments,
  emptyMoments,
  loopScatter,
  loopScore,
  loopScoreBound,
  planeError,
} from "../src/model/edge-loop-score.js";
import type { Vector } from "../src/sketch/planes.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/close-edge-loop-fillets.json", "utf8")) as {
  document: { bodies: Body[] };
  rim: string[];
};
const body = fixture.document.bodies[0];
const curvedSeeds = [7, 16, 22, 32, 41, 50, 61, 79].map((i) => body.edges[i].id);
const moments = (edges: readonly Edge[]) =>
  edges.reduce((sum, edge) => addMoments(sum, edgeMoments(edge, body.center)), emptyMoments());

function checkRim(solid: Body, selection: string[], expected = fixture.rim): void {
  const completions = edgeLoopCompletions(solid, new Set(selection));
  assert.equal(completions.length, 1);
  assert.ok(completions[0].exhaustive, "The capture's candidate search must finish");
  assert.deepEqual(new Set([...selection, ...completions[0].added]), new Set(expected));
}

test("captured many-sided rim beats small fillet loops from every curved seed", () => {
  for (const seed of curvedSeeds) checkRim(body, [seed]);
  // A straight seed plus its adjacent arc also fixes the intended plane.
  for (const pair of [
    [12, 16],
    [19, 22],
    [27, 32],
    [46, 50],
    [55, 61],
  ])
    checkRim(
      body,
      pair.map((i) => body.edges[i].id),
    );
});

test("a straight edge still prefers its smaller planar side wall to a bent fillet patch", () => {
  for (const indices of [
    [12, 13, 15, 14],
    [27, 23, 26, 25],
    [55, 56, 58, 57],
  ]) {
    const expected = indices.map((i) => body.edges[i].id);
    checkRim(body, [expected[0]], expected);
  }
});

test("the new score prefers the planar perimeter even when the fillet loop is much shorter", () => {
  const seed = body.edges[12];
  const fillet = moments([12, 7, 6, 10, 11].map((i) => body.edges[i]));
  const rim = moments(body.edges.filter((e) => fixture.rim.includes(e.id)));
  const seedLength = edgeMoments(seed, body.center).length;
  assert.ok(fillet.length < rim.length / 2);
  assert.ok(Math.sqrt(planeError(fillet) / fillet.length) > 0.2);
  assert.ok(loopScore(rim, seedLength) < loopScore(fillet, seedLength));
});

test("splitting the selected rim arc into individual segments does not change completion", () => {
  const seed = body.edges[22];
  const parts: Edge[] = [];
  for (let i = 3; i < seed.points.length; i += 3) {
    const start = seed.points.slice(i - 3, i) as Vector;
    const end = seed.points.slice(i, i + 3) as Vector;
    parts.push({
      ...seed,
      id: `${seed.id}/${i}`,
      points: [...start, ...end],
      curve: null,
      landmarks: {
        start,
        end,
        midpoint: start.map((v, k) => (v + end[k]) / 2) as Vector,
        closed: false,
      },
    });
  }
  const selected = parts.map((e) => e.id);
  checkRim({ ...body, edges: body.edges.flatMap((e) => (e === seed ? parts : [e])) }, selected, [
    ...fixture.rim.filter((id) => id !== seed.id),
    ...selected,
  ]);
});

test("rim ranking is unchanged by scale and arbitrary rigid orientation", () => {
  for (const scale of [0.01, 1, 1000]) {
    const transform = (p: Vector): Vector => [
      100 + scale * (0.6 * p[0] - 0.8 * p[1]),
      -50 + scale * (0.64 * p[0] + 0.48 * p[1] - 0.6 * p[2]),
      77 + scale * (0.48 * p[0] + 0.36 * p[1] + 0.8 * p[2]),
    ];
    const transformed: Body = {
      ...body,
      center: transform(body.center),
      edges: body.edges.map((e) => {
        const points = [];
        for (let i = 0; i < e.points.length; i += 3)
          points.push(...transform(e.points.slice(i, i + 3) as Vector));
        return {
          ...e,
          points,
          landmarks: e.landmarks
            ? {
                ...e.landmarks,
                start: transform(e.landmarks.start),
                end: transform(e.landmarks.end),
                midpoint: transform(e.landmarks.midpoint),
              }
            : undefined,
        };
      }),
    };
    for (const seed of curvedSeeds) checkRim(transformed, [seed]);
  }
});

test("search bound remains conservative when a wider return improves relative flatness", () => {
  const edge = (points: Vector[]): Edge => ({
    id: "path",
    points: points.flat(),
    curve: null,
    signature: [],
  });
  const partial = moments([
    edge([
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ]),
  ]);
  const rest = moments([
    edge([
      [0, 1, 0],
      [0, 100, 0],
      [100, 100, 0],
      [100, 0, 0],
      [0, 0, 0],
    ]),
  ]);
  const completed = addMoments(partial, rest);
  const width = loopScatter(completed)[1];
  assert.ok(
    loopScore(partial, 1) > loopScore(completed, 1),
    "Partial score alone is unsafe to prune",
  );
  assert.ok(loopScoreBound(partial, rest.length, 1, width) <= loopScore(completed, 1) + 1e-8);
});
