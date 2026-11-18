import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { ExactBody } from "../src/model/exact-body.js";

test("a 1 mm chamfer consuming the annular shoulder keeps the tapered body", async () => {
  // This five-face section still produces the four-face detached tip in OCCT.
  const body: ExactBody = JSON.parse(
    readFileSync("tests/fixtures/chamfer-tapered-shoulder.json", "utf8"),
  );
  const rim = body.edges.find(
    ({ signature: s }) => Math.abs(s[2] - 12 * Math.PI) < 1e-8 && Math.abs(s[5] + 110) < 1e-8,
  );
  assert.ok(rim);
  const kernel = new SolidCalculator();
  try {
    const [source] = (await kernel.calculate({ kind: "inspect", bodies: [body] })).results;
    for (const size of [0.99, 1]) {
      const {
        results: [result],
      } = await kernel.calculate({
        kind: "edge-finish",
        mode: "chamfer",
        size,
        edges: [{ body: body.id, edge: rim.id }],
        bodies: [body],
      });
      const ring = Math.PI * size ** 2 * (6 + size / 3);
      assert.ok(Math.abs(result.volume - source.volume - ring) < 1e-7);
      assert.ok(result.bounds.every((value, i) => Math.abs(value - source.bounds[i]) < 1e-6));
      assert.ok(
        result.faces.some((face) => face.predecessors.includes("f4")),
        "The opposite cap survives",
      );
    }
    await assert.rejects(
      kernel.calculate({
        kind: "edge-finish",
        mode: "chamfer",
        size: 1.01,
        edges: [{ body: body.id, edge: rim.id }],
        bodies: [body],
      }),
      /not feasible/,
    );
  } finally {
    kernel.close();
  }
});
