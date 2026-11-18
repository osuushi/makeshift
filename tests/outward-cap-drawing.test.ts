import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { kernelInput } from "../src/backend/kernel-input.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Extrusion } from "../src/model/body.js";
import type { ExactBody } from "../src/model/exact-body.js";
import { outwardCapDrawing } from "../src/model/outward-cap-drawing.js";

test("an isolated outward cap draws a closed extension and reseats only its tip on drag", async () => {
  const input: ExactBody = JSON.parse(
    readFileSync("tests/fixtures/chamfer-tapered-shoulder.json", "utf8"),
  );
  const kernel = new SolidCalculator();
  try {
    const [body] = materialize([], await kernel.calculate({ kind: "inspect", bodies: [input] }));
    const disk = body.faces.find((f) => f.plane && Math.abs(f.signature[5] + 103) < 1e-7);
    assert.ok(disk);
    const edit: Extrusion = { sources: [{ face: disk.id }], distance: 2, mode: "auto" };
    const [first] = outwardCapDrawing([body], edit)?.bodies ?? [];
    assert.ok(first?.stationary);
    const shifted = outwardCapDrawing([body], { ...edit, distance: 3 })?.bodies[0];
    assert.equal(shifted?.stationary, first.stationary);
    assert.ok(Math.abs(first.bounds[5] + 101) < 1e-6);
    assert.equal(first.stationary.faces.length, body.faces.length - 1);
    assert.ok(
      first.stationary.faces.every((points) => body.faces.some((f) => f.vertices === points)),
    );
    const checked = await kernel.calculate({
      ...kernelInput({ units: "mm", sketches: [], bodies: [body] }, edit, [body]),
      presentation: "visual",
    });
    const [exact] = checked.results;
    assert.equal(first.edges.length + first.stationary.edges.length, exact.edges.length);
    assert.deepEqual(
      [...(first.stationary.sourceFaces ?? []), ...(first.sourceFaces ?? [])].flat().sort(),
      exact.sourceFaces?.flat().sort(),
    );
    assert.deepEqual(
      [...(first.stationary.sourceEdges ?? []), ...(first.sourceEdges ?? [])].flat().sort(),
      exact.sourceEdges?.flat().sort(),
    );
    // Every oriented boundary segment in the closed display must have its reverse.
    const counts = new Map<string, number>();
    for (const triangles of [...first.stationary.faces, ...first.faces]) {
      for (let i = 0; i < triangles.length; i += 9) {
        const pts = [0, 3, 6].map((offset) =>
          triangles
            .slice(i + offset, i + offset + 3)
            .map((x) => Math.round(x * 1e7))
            .join(","),
        );
        for (let j = 0; j < 3; j++) {
          const a = pts[j],
            b = pts[(j + 1) % 3];
          if (a === b) continue;
          const key = a < b ? [a, b].join("/") : [b, a].join("/");
          counts.set(key, (counts.get(key) ?? 0) + (a < b ? 1 : -1));
        }
      }
    }
    assert.ok([...counts.values()].every((n) => n === 0));
    const blocker = { ...body, id: "blocker", bounds: [-1, -1, -102, 1, 1, -101.5] };
    assert.equal(outwardCapDrawing([body, blocker], edit), null);
    assert.ok(outwardCapDrawing([body, blocker], { ...edit, eligibleTargets: [body.id] }));
    assert.equal(outwardCapDrawing([body], { ...edit, distance: -2 }), null);
    assert.equal(outwardCapDrawing([body], { ...edit, symmetric: true }), null);
    assert.equal(outwardCapDrawing([body], { ...edit, mode: "subtract" }), null);
  } finally {
    kernel.close();
  }
});
