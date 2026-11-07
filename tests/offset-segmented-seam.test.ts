import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body, Face } from "../src/model/body.js";
import type { ExactBody } from "../src/model/exact-body.js";
import { exportBodies } from "../src/model/mesh-export.js";

const body: ExactBody = JSON.parse(
  readFileSync("tests/fixtures/offset-segmented-seam.json", "utf8"),
);
const bore = "f3";
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
}
function checkOffset(original: Body, result: Body, distance: number) {
  near(result.faces.find((face) => face.id === bore)?.cylinder?.radius ?? NaN, 5 - distance);
  near(result.volume, Math.PI * (100 - (5 - distance) ** 2) * 12);
  assert.deepEqual(
    new Set(result.faces.map((f) => f.id)),
    new Set(original.faces.map((f) => f.id)),
  );
  assert.deepEqual(
    new Set(result.edges.map((e) => e.id)),
    new Set(original.edges.map((e) => e.id)),
  );
  for (const face of original.faces.filter((face) => face.id !== bore)) {
    const current: Face | undefined = result.faces.find((candidate) => candidate.id === face.id);
    assert.deepEqual(current?.cylinder, face.cylinder);
    assert.deepEqual(current?.plane, face.plane);
  }
}

test("cylindrical offset preserves a stepped periodic seam and both stationary caps", async () => {
  const owner = new DocumentOwner();
  const kernel = new SolidCalculator();
  try {
    const { topology } = await kernel.calculate({
      kind: "topology",
      body: body.id,
      bodies: [body],
    });
    const wall = topology.faces.find((face) => face.id === bore);
    assert.ok(wall);
    const seams = wall.loops.flatMap((loop) => loop.edges).filter((edge) => edge.seam);
    assert.equal(seams.length, 6);
    assert.ok(
      seams.some(
        (use) => topology.edges.find((edge) => edge.id === use.edge)?.curve.kind === "circle",
      ),
    );
    const opened = await owner.call({
      kind: "open",
      document: {
        units: "mm",
        sketches: [],
        bodies: materialize([], await kernel.calculate({ kind: "inspect", bodies: [body] })),
      },
    });
    assert.equal(opened.error, undefined);
    const before = owner.view.data;
    const original = before.bodies?.[0];
    assert.ok(original);
    near(original.volume, Math.PI * 75 * 12);
    const offset = (distance: number) =>
      owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: bore }], distance },
      });
    for (const distance of [-1, -0.1, 0.1, 1]) {
      const reply = await offset(distance);
      assert.equal(reply.error, undefined);
      near(reply.view.offsetDistance ?? NaN, distance);
      const result = reply.view.candidate?.bodies?.[0];
      assert.ok(result);
      checkOffset(original, result, distance);
      assert.deepEqual(owner.view.data, before);
    }
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    for (const format of ["stl", "3mf"] as const)
      assert.ok(exportBodies(accepted.bodies ?? [], format).length > 0);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const reopened = owner.view.data;
    const reverse = await offset(-1);
    assert.equal(reverse.error, undefined);
    near(reverse.view.offsetDistance ?? NaN, -1);
    near(reverse.view.candidate?.bodies?.[0].volume ?? NaN, original.volume);
    const limited = await offset(-7);
    assert.equal(limited.error, undefined);
    assert.ok((limited.view.offsetDistance ?? -Infinity) > -6);
    assert.ok((limited.view.candidate?.bodies?.[0].volume ?? 0) > 0);
    assert.deepEqual(owner.view.data, reopened);
  } finally {
    owner.close();
    kernel.close();
  }
});
