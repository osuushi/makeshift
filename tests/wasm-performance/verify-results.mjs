import assert from "node:assert/strict";
import { resolve } from "node:path";
import { square } from "../geometry-performance/cases.mjs";
import { Client, operand } from "../geometry-performance/client.mjs";
import { prepareCases } from "./cases.mjs";

// Same compiler and thread count: compare every serialized property, including
// exact bounds, BRep, mesh, signatures and correspondence, across the optimization.
const [before, after] = process.argv.slice(2);
if (!before || !after) throw new Error("Usage: verify-results.mjs BEFORE_KERNEL AFTER_KERNEL");
const baseline = new Client(resolve(before), 1);
const candidate = new Client(resolve(after), 1);
try {
  const { cases } = await prepareCases(baseline);
  const requests = cases.filter((scenario) => !scenario.limitDocument);
  requests.push(
    { name: "rimmed-corners-0.4mm", input: { ...cases.at(-1).input, size: 0.4 } },
    {
      name: "planar-extrusion",
      input: {
        kind: "extrude",
        normal: [0, 0, 1],
        profiles: [square(0, 0, 10)],
        distance: 10,
        mode: "new",
        bodies: [],
      },
    },
  );
  for (const scenario of requests) {
    const expected = (await baseline.request(scenario.input)).reply;
    const actual = (await candidate.request(scenario.input)).reply;
    assert.deepEqual(actual, expected, scenario.name);
    if (expected.error) continue;
    // A subsequent transform must measure the new shape, not retain old bounds.
    const body = operand(expected.results[0], "translated");
    const move = {
      kind: "transform",
      bodies: [body],
      ids: [body.id],
      translation: [12, -7, 3],
      pivot: [0, 0, 0],
      axis: [0, 0, 1],
      angle: 0,
      duplicate: false,
    };
    const moved = (await candidate.request(move)).reply;
    assert.equal(moved.error, undefined);
    assert.deepEqual(moved, (await baseline.request(move)).reply, `${scenario.name} moved`);
    moved.results[0].bounds.forEach((value, index) => {
      assert.ok(
        Math.abs(value - expected.results[0].bounds[index] - move.translation[index % 3]) < 1e-6,
        "Translated exact bounds",
      );
    });
    console.log(`${scenario.name}: complete result and translated bounds agree`);
  }
} finally {
  await baseline.close();
  await candidate.close();
}
