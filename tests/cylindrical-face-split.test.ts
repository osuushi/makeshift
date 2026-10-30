import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/cylindrical-face-split.json", "utf8")) as {
  document: SketchDocument;
};
test("captured cylindrical support splits at an existing circular rim", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    const cutter = before.bodies?.[1];
    const face = cutter?.faces.find((face) => face.cylinder);
    assert.ok(cutter && face);
    const operation = {
      mode: "split" as const,
      targets: [{ body: body.id }],
      surface: { body: cutter.id, face: face.id },
    };
    assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
    const pieces = owner.view.candidate?.bodies?.filter((part) => part.id !== cutter.id);
    assert.ok(pieces);
    assert.equal(pieces.length, 2);
    assert.ok(pieces.every((piece) => piece.volume > 0));
    const collar = pieces.find((piece) => piece.bounds[5] > 618);
    assert.ok(collar);
    for (const [index, expected] of [
      [0, 70],
      [1, 70],
      [3, 150],
      [4, 150],
    ] as const)
      assert.ok(Math.abs(collar.bounds[index] - expected) < 1e-6);
    assert.ok(
      Math.abs(pieces.reduce((sum, part) => sum + part.volume, 0) - body.volume) <
        body.volume * 1e-7,
    );
    assert.equal(
      owner.view.candidate?.bodies?.find((part) => part.id === cutter.id)?.brep,
      cutter.brep,
    );
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "discard" });
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
    await owner.call({ kind: "accept" });
    const after = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
  } finally {
    owner.close();
  }
});
