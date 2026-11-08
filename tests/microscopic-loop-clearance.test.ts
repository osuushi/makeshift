import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/chamfer-segmented-shelf.json", "utf8")) as {
  document: SketchDocument;
};

test("segmented boundary loops cannot publish a sub-micron chamfer shelf", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    const bevel = body?.faces.find((face) => face.chamfer)?.chamfer;
    assert.ok(body && bevel);
    const faces = bevel.faces.map((face) => ({ body: body.id, face }));
    const restored = await owner.call({
      kind: "offset-faces",
      operation: { faces, radius: 3, chamfer: true, distance: 0, limit: false },
    });
    assert.equal(restored.error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const before = owner.view.data;
    const candidate = await owner.call({
      kind: "offset-faces",
      operation: { faces, radius: 3.4995, chamfer: true, distance: 0, limit: false },
    });
    assert.equal(candidate.error, undefined);
    const repaired = candidate.view.candidate?.bodies?.[0];
    assert.ok(repaired);
    assert.ok(
      repaired.faces.filter((face) => face.plane).every((face) => face.signature[2] > 1),
      "The captured 0.0005 mm shelf must be removed before acceptance",
    );
    assert.deepEqual(owner.view.data, before);
    const correction = await owner.call({
      kind: "offset-faces",
      operation: { faces, radius: 3.4, chamfer: true, distance: 0, limit: false },
    });
    assert.equal(correction.error, undefined);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
    assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  } finally {
    owner.close();
  }
});
