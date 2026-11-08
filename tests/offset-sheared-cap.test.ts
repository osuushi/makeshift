import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { BodyFaceOffset } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

for (const name of ["shear-extension", "split-extension"]) {
  const fixture = JSON.parse(readFileSync(`tests/fixtures/offset-${name}.json`, "utf8")) as {
    document: SketchDocument;
    operation: BodyFaceOffset;
  };
  test(`captured ${name} continues existing supports without adding faces or join edges`, async () => {
    const owner = new DocumentOwner();
    try {
      assert.equal(
        (await owner.call({ kind: "open", document: fixture.document })).error,
        undefined,
      );
      const before = owner.view.data;
      const source = before.bodies?.[0];
      assert.ok(source);
      for (const distance of [fixture.operation.distance, -1, 0.5]) {
        const started = performance.now();
        const reply = await owner.call({
          kind: "offset-faces",
          operation: { ...fixture.operation, distance },
        });
        assert.equal(reply.error, undefined);
        // Generous native-call ceiling catches the former 7–16 second quadrature stall.
        assert.ok(
          performance.now() - started < 5000,
          "Tube extension stalled in volume integration",
        );
        const body = reply.view.candidate?.bodies?.[0];
        assert.ok(body);
        assert.equal(body.faces.length, source.faces.length);
        assert.equal(body.edges.length, source.edges.length);
        assert.deepEqual(
          new Set(body.faces.map((f) => f.id)),
          new Set(source.faces.map((f) => f.id)),
        );
        assert.ok(Math.abs(body.bounds[5] - 12 - distance) < 1e-6);
        assert.ok(Math.abs(body.bounds[3] - 20 - (distance * 10) / 12) < 1e-6);
        assert.ok(Math.abs(body.volume - (source.volume * (12 + distance)) / 12) < 1e-5);
        assert.deepEqual(owner.view.data, before);
      }
      assert.equal((await owner.call({ kind: "accept" })).error, undefined);
      const accepted = owner.view.data;
      assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
      assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
      assert.equal(
        (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) }))
          .error,
        undefined,
      );
      assert.equal(
        (
          await owner.call({
            kind: "offset-faces",
            operation: { ...fixture.operation, distance: 2 },
          })
        ).error,
        undefined,
      );
    } finally {
      owner.close();
    }
  });
}
