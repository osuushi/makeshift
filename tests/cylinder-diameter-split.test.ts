import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/cylinder-diameter-split.json", "utf8")) as {
  document: SketchDocument;
};
for (const [name, frame] of [
  ["XZ", planes.XZ],
  ["YZ", planes.YZ],
] as const) {
  test(`captured centered cylinder splits along ${name} without misrecognizing a chamfer`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const body = before.bodies?.[0];
      assert.ok(body);
      const operation = { mode: "split" as const, targets: [{ body: body.id }], frame };
      assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
      assert.equal(owner.view.candidate?.bodies?.length, 2);
      for (const piece of owner.view.candidate?.bodies ?? []) {
        assert.ok(Math.abs(piece.volume - 112.5 * Math.PI) < 1e-6);
        assert.ok(piece.faces.every((face) => !face.chamfer));
      }
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
}
