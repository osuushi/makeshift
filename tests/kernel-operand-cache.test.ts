import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { ExactBody } from "../src/model/exact-body.js";

test("reusing checked input geometry still verifies current topology signatures and identities", async () => {
  const { document } = JSON.parse(
    readFileSync("tests/fixtures/erosion-connected-cylinders.json", "utf8"),
  ) as {
    document: { bodies: ExactBody[] };
  };
  const [body] = document.bodies;
  const kernel = new SolidCalculator();
  try {
    await kernel.calculate({ kind: "inspect", bodies: [body] });
    const [first, ...rest] = body.faces;
    const wrong = { ...first, signature: first.signature.map((x, i) => (i === 2 ? x + 1 : x)) };
    await assert.rejects(
      kernel.calculate({ kind: "inspect", bodies: [{ ...body, faces: [wrong, ...rest] }] }),
      /identity does not match/,
    );
    const renamed = { ...body, faces: [{ ...first, id: "renamed-face" }, ...rest] };
    const {
      results: [result],
    } = await kernel.calculate({ kind: "inspect", bodies: [renamed] });
    assert.ok(result.faces.some((face) => face.predecessors.includes("renamed-face")));
  } finally {
    kernel.close();
  }
});
