import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { BodyEdgeFinish } from "../src/model/body.js";
import type { ExactBody } from "../src/model/exact-body.js";

const fixture: { bodies: ExactBody[]; operation: BodyEdgeFinish } = JSON.parse(
  readFileSync("tests/fixtures/top-surface-fillet.json", "utf8"),
);

test("captured top fillet uses drawing bounds while preserving its exact completed geometry", async () => {
  const kernel = new SolidCalculator();
  try {
    const input = {
      ...fixture.operation,
      kind: "edge-finish" as const,
      size: 3,
      bodies: fixture.bodies,
    };
    const expected = await kernel.calculate(input);
    const visual = await kernel.calculate({ ...input, presentation: "deferred" });
    const drawing = visual.results[0];
    const minima = [Infinity, Infinity, Infinity],
      maxima = [-Infinity, -Infinity, -Infinity];
    for (const face of drawing.faces)
      for (let i = 0; i < face.length; i++) {
        minima[i % 3] = Math.min(minima[i % 3], face[i]);
        maxima[i % 3] = Math.max(maxima[i % 3], face[i]);
      }
    assert.deepEqual(drawing.bounds, [...minima, ...maxima]);
    assert.deepEqual(
      visual.results[0].faces,
      expected.results[0].faces.map((face) => face.vertices),
    );
    assert.ok(Math.abs(expected.results[0].volume - 947425.100051) < 0.001);
    assert.deepEqual(
      await kernel.calculate({ kind: "complete-preview", bodies: fixture.bodies }),
      expected,
    );
  } finally {
    kernel.close();
  }
});

test("native top-fillet preview performs no volume integration before explicit completion", () => {
  const input = {
    ...fixture.operation,
    kind: "edge-finish",
    size: 3,
    bodies: fixture.bodies,
    presentation: "deferred",
  };
  const result = spawnSync(SolidCalculator.executable, [], {
    input: `${JSON.stringify(input)}\n${JSON.stringify({ kind: "complete-preview", bodies: [] })}\n`,
    encoding: "utf8",
    env: { ...process.env, MAKESHIFT_KERNEL_TIMING: "1" },
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const replies = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(replies.length, 2);
  for (const reply of replies) assert.equal(reply.error, undefined);
  const boundary = result.stderr.indexOf("kernel complete-preview parse");
  assert.ok(boundary > 0);
  assert.doesNotMatch(result.stderr.slice(0, boundary), /kernel volume/);
  assert.match(result.stderr.slice(boundary), /kernel volume integrate/);
  assert.equal(replies[0].results[0].volume, undefined);
  assert.ok(replies[1].results[0].volume > 0);
});
