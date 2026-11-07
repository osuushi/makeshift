import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { ExactBody } from "../src/model/exact-body.js";

const body: ExactBody = JSON.parse(
  readFileSync("tests/fixtures/offset-opposed-bores.json", "utf8"),
);
const bore = "830906d9-875f-470b-b545-339e48c122c5";
const reference = "39143ce7-c5be-403d-a6cc-b3b69a0981e6";
const floor = "897fc159-8467-4d87-8adc-782aee84ec3a";
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
}

test("offset resizes the captured blind bore while preserving the opposite end", async () => {
  const kernel = new SolidCalculator();
  try {
    const {
      results: [original],
    } = await kernel.calculate({ kind: "inspect", bodies: [body] });
    assert.ok(original);
    for (const distance of [1, -0.5]) {
      const {
        results: [result],
      } = await kernel.calculate({
        kind: "offset-faces",
        bodies: [body],
        faces: [{ body: body.id, face: bore }],
        distance,
      });
      const radius = 4 - distance;
      assert.deepEqual(result.predecessorBodies, [body.id]);
      const selected = result.faces.filter((face) => face.offsetSelected);
      assert.equal(selected.length, 1);
      const [wall] = selected;
      assert.deepEqual(wall.predecessors, [bore]);
      near(wall.cylinder?.radius ?? NaN, radius);
      near(wall.bounds?.[2] ?? NaN, 288);
      near(wall.bounds?.[5] ?? NaN, 300);
      near(wall.thickness?.distance ?? NaN, 5 - radius);
      assert.deepEqual(result.faces[wall.thickness?.faceIndex ?? -1]?.predecessors, [reference]);
      const bottom = result.faces.find((face) => face.predecessors.includes(floor));
      near(bottom?.signature[2] ?? NaN, Math.PI * radius ** 2);
      near(result.volume, original.volume + Math.PI * (4 ** 2 - radius ** 2) * 12);
      assert.equal(result.faces.length, body.faces.length);
      assert.equal(result.edges.length, body.edges.length);
      const oppositeFaces = original.faces.filter((face) => (face.bounds?.[5] ?? Infinity) <= 12);
      assert.equal(oppositeFaces.length, 16);
      for (const opposite of oppositeFaces) {
        const continuing = result.faces.find((face) =>
          face.predecessors.includes(opposite.predecessors[0]),
        );
        assert.ok(continuing, "Opposite bore and its relief faces must survive");
        for (const [i, value] of opposite.signature.entries()) near(continuing.signature[i], value);
      }
    }
  } finally {
    kernel.close();
  }
});

test("captured outer wall expands without changing either cavity", async () => {
  const captured: ExactBody = JSON.parse(
    readFileSync("tests/fixtures/offset-outer-wall.json", "utf8"),
  );
  const kernel = new SolidCalculator();
  try {
    const {
      results: [original],
    } = await kernel.calculate({ kind: "inspect", bodies: [captured] });
    for (const distance of [0.5, 2, -0.25]) {
      const {
        results: [result],
      } = await kernel.calculate({
        kind: "offset-faces",
        bodies: [captured],
        faces: [{ body: captured.id, face: reference }],
        distance,
      });
      const outer = result.faces.find((f) => f.offsetSelected);
      near(outer?.cylinder?.radius ?? NaN, 5 + distance);
      near(result.volume - original.volume, Math.PI * ((5 + distance) ** 2 - 25) * 300);
      for (const face of original.faces.filter((f) => f.cylinder?.outward === -1)) {
        const next = result.faces.find((f) => f.predecessors.includes(face.predecessors[0]));
        assert.deepEqual(next?.cylinder, face.cylinder);
        assert.deepEqual(next?.bounds, face.bounds);
      }
    }
  } finally {
    kernel.close();
  }
});
