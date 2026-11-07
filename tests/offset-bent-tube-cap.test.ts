import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { materialize } from "../src/backend/kernel-result.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body, BodyFaceOffset } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { extrude } from "./face-cut-fixtures.js";

const fixture: { document: SketchDocument; operation: BodyFaceOffset } = JSON.parse(
  readFileSync("tests/fixtures/offset-bent-tube-cap.json", "utf8"),
);
const area = Math.PI * (4.6 ** 2 - 3.175 ** 2);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

function checkExtension(original: Body, result: Body, distance: number): void {
  near(result.volume, original.volume + area * distance);
  near(result.bounds[5], original.bounds[5] + distance);
  for (const i of [0, 2, 3, 4]) near(result.bounds[i], original.bounds[i]);
  const sideways = (-1.3 * distance) / 10.4845;
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
  near(selected?.signature[4] ?? NaN, -4.5 + sideways);
  near(selected?.bounds?.[1] ?? NaN, -9.1 + sideways);
  near(selected?.bounds?.[4] ?? NaN, 0.1 + sideways);
  assert.equal(
    result.faces.filter((f) => f.cylinder?.origin[1] === -4.5).length,
    0,
    "Offset must not add vertical cylinders at the oblique rim",
  );
}

test("captured bent tube cap continues its oblique walls with fixed original supports, preview reversal and history", async () => {
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

test("rotated bent tube cap continues its walls to a rotated cap plane", async () => {
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
    near(cap.signature[5], -1.5 - (1.3 * 17.3) / 10.4845);
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

test("offsetting a tapered cap changes its intersection radius while preserving the cone", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await extrude(
      owner,
      {
        ...emptySketch(planes.XY),
        curves: [
          { id: "rim", kind: "circle", center: { x: 0, y: 0 }, radius: 5, construction: false },
        ],
      },
      10,
      { draft: { mode: "angle", value: 2 } },
    );
    const cap = body.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-6);
    const wall = body.faces.find((f) => f.cone);
    assert.ok(cap && wall?.cone);
    for (const distance of [2, -2]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: cap.id }], distance, limit: false },
      });
      assert.equal(reply.error, undefined);
      const result = reply.view.candidate?.bodies?.[0];
      assert.ok(result);
      const next = result.faces.find((f) => f.id === cap.id);
      const height = 10 + distance,
        radius = 5 + height * Math.tan(Math.PI / 90);
      near(next?.bounds?.[5] ?? NaN, height);
      near(next?.signature[2] ?? NaN, Math.PI * radius * radius);
      near(result.volume, ((Math.PI * height) / 3) * (25 + 5 * radius + radius * radius));
      assert.deepEqual(result.faces.find((f) => f.id === wall.id)?.cone, wall.cone);
    }
  } finally {
    owner.close();
  }
});
