import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body, BodyFaceOffset } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture: { document: SketchDocument; operation: BodyFaceOffset } = JSON.parse(
  readFileSync("tests/fixtures/offset-bent-tube-cap.json", "utf8"),
);
const area = Math.PI * (4.6 ** 2 - 3.175 ** 2);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

function checkExtension(original: Body, result: Body, distance: number): void {
  near(result.volume, original.volume + area * distance);
  near(result.bounds[5], original.bounds[5] + distance);
  for (let i = 0; i < 5; i++) near(result.bounds[i], original.bounds[i]);
  const selected = result.faces.find((f) => f.id === fixture.operation.faces[0].face);
  near(selected?.plane?.origin[2] ?? NaN, 44.1845 + distance);
  near(selected?.signature[2] ?? NaN, area);
  // The spline bend must survive exactly, rather than stretching to the new cap.
  for (const face of original.faces.filter((f) => f.signature[0] === 6)) {
    const continued = result.faces.find((f) => f.id === face.id);
    assert.ok(continued);
    assert.deepEqual(continued.signature, face.signature);
    assert.deepEqual(continued.bounds, face.bounds);
    assert.deepEqual(continued.vertices, face.vertices);
  }
  const walls = result.faces.filter((f) => f.cylinder?.origin[1] === -4.5);
  assert.equal(walls.length, 2);
  for (const wall of walls) {
    const cylinder = wall.cylinder;
    assert.ok(cylinder);
    near(cylinder.radius, cylinder.outward === 1 ? 4.6 : 3.175);
    near(wall.bounds?.[2] ?? NaN, 44.1845);
    near(wall.bounds?.[5] ?? NaN, 44.1845 + distance);
  }
}

test("captured bent tube cap extends normally with fixed bend, preview reversal and history", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    for (const distance of [0.001, 17.3, 1]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { ...fixture.operation, distance },
      });
      assert.equal(reply.error, undefined);
      near(reply.view.offsetDistance ?? NaN, distance);
      assert.deepEqual(reply.view.offsetSelection, fixture.operation.faces);
      const result = reply.view.candidate?.bodies?.[0];
      assert.ok(result);
      checkExtension(body, result, distance);
      assert.deepEqual(owner.view.data, before);
    }
    await owner.call({ kind: "discard" });
    assert.deepEqual(owner.view.data, before);
    const preview = await owner.call({ kind: "offset-faces", operation: fixture.operation });
    assert.equal(preview.error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    checkExtension(body, accepted.bodies?.[0] as Body, 17.3);
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
    assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) })).error,
      undefined,
    );
    const later = await owner.call({
      kind: "offset-faces",
      operation: { ...fixture.operation, distance: 2 },
    });
    assert.equal(later.error, undefined);
    near(later.view.offsetDistance ?? NaN, 2);
    const extended = later.view.candidate?.bodies?.[0];
    assert.ok(extended);
    checkExtension(body, extended, 19.3);
  } finally {
    owner.close();
  }
});

test("rotated bent tube cap extends along its own normal", async () => {
  const kernel = new SolidCalculator();
  const bodies = fixture.document.bodies ?? [];
  try {
    const rotated = materialize(
      bodies,
      await kernel.calculate({
        kind: "transform",
        bodies,
        ids: bodies.map((b) => b.id),
        pivot: [0, 0, 0],
        axis: [1, 0, 0],
        angle: 90,
        translation: [7, 12, 3],
        duplicate: false,
      }),
    );
    const result = await kernel.calculate({
      kind: "offset-faces",
      ...fixture.operation,
      bodies: rotated,
    });
    assert.equal(result.results.length, 1);
    const body = result.results[0];
    near(body.volume, rotated[0].volume + area * 17.3);
    const cap = body.faces.find((f) => f.offsetSelected);
    assert.ok(cap?.plane);
    near(cap.signature[3], 0.5);
    near(cap.signature[4], 12 - 61.4845);
    near(cap.signature[5], -1.5);
    const walls = body.faces.filter((f) => f.cylinder && !f.predecessors.length);
    assert.equal(walls.length, 2);
    for (const wall of walls) near(Math.abs(wall.cylinder?.axis[1] ?? NaN), 1);
    for (const original of rotated[0].faces.filter((f) => f.signature[0] === 6)) {
      const continued = body.faces.find((f) => f.predecessors.includes(original.id));
      assert.ok(continued);
      continued.signature.forEach((value, i) => {
        assert.ok(Math.abs(value - original.signature[i]) < 1e-12);
      });
      assert.equal(continued.vertices.length, original.vertices.length);
      // Located geometry is serialized and remeshed in world coordinates.
      continued.vertices.forEach((value, i) => {
        assert.ok(Math.abs(value - original.vertices[i]) < 1e-12);
      });
    }
  } finally {
    kernel.close();
  }
});
