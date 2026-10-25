import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { SolidCalculator } from "../src/backend/solid-calculator.js";
import type { Body, BodyFaceOffset } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture: { document: SketchDocument; operation: BodyFaceOffset } = JSON.parse(
  readFileSync("tests/fixtures/offset-two-arc-cap.json", "utf8"),
);
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

function checkBody(body: Body, original: Body, height: number): void {
  const top = fixture.operation.faces[0].face;
  near(body.bounds[5], height);
  near(body.bounds[2], 0);
  near(body.volume, (original.volume / 11.5) * height);
  assert.equal(body.faces.length, 4);
  assert.equal(body.edges.length, 6);
  assert.deepEqual(
    body.faces.map((face) => face.id).sort(),
    original.faces.map((face) => face.id).sort(),
  );
  assert.deepEqual(
    body.edges.map((edge) => edge.id).sort(),
    original.edges.map((edge) => edge.id).sort(),
  );
  for (const face of original.faces) {
    const next = body.faces.find((item) => item.id === face.id);
    assert.ok(next?.vertices.length);
    if (face.cylinder) assert.deepEqual(next.cylinder, face.cylinder);
    else if (face.id !== top) assert.deepEqual(next.plane, face.plane);
  }
  near(body.faces.find((face) => face.id === top)?.thickness?.distance ?? NaN, height);
}

test("captured two-arc cap lowers and raises with every cylindrical boundary, history and exact limits", async () => {
  const owner = new DocumentOwner(),
    kernel = new SolidCalculator();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data,
      body = original.bodies?.[0];
    assert.ok(body);
    for (const distance of [-0.5, -7, 1, -11.4]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { ...fixture.operation, distance },
      });
      assert.equal(reply.error, undefined);
      near(reply.view.offsetDistance ?? NaN, distance);
      const result = reply.view.candidate?.bodies?.[0];
      assert.ok(result);
      checkBody(result, body, 11.5 + distance);
      assert.deepEqual(owner.view.data, original);
    }
    for (const distance of [-11.5, -12])
      await assert.rejects(
        kernel.calculate({
          kind: "offset-faces",
          ...fixture.operation,
          distance,
          bodies: [body],
        }),
      );
    const reply = await owner.call({ kind: "offset-faces", operation: fixture.operation });
    assert.equal(reply.error, undefined);
    near(reply.view.offsetDistance ?? NaN, -7);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    checkBody(accepted.bodies?.[0] as Body, body, 4.5);
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, original);
    assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) })).error,
      undefined,
    );
    const restored = await owner.call({
      kind: "offset-faces",
      operation: { ...fixture.operation, distance: 7 },
    });
    assert.equal(restored.error, undefined);
    checkBody(restored.view.candidate?.bodies?.[0] as Body, body, 11.5);
  } finally {
    owner.close();
    kernel.close();
  }
});
