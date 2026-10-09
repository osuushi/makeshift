import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Extrusion } from "../src/model/body.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/pen-extrusion.json", "utf8")) as {
  document: SketchDocument;
  extrusion: Extrusion;
};
for (const distance of [16, -16]) {
  for (const symmetric of [false, true]) {
    test(`captured Pen outline extrudes ${distance} mm, symmetric=${symmetric}`, async () => {
      const owner = new DocumentOwner();
      try {
        assert.equal(
          (await owner.call({ kind: "open", document: fixture.document })).error,
          undefined,
        );
        const before = owner.view.data;
        const reply = await owner.call({
          kind: "extrude",
          extrusion: { ...fixture.extrusion, distance, symmetric },
        });
        assert.equal(reply.error, undefined);
        assert.deepEqual(reply.view.data, before, "Preview does not modify the source");
        const body = reply.view.candidate?.bodies?.[0];
        assert.ok(body);
        assert.ok(body.volume > 4800 && body.volume < 4900);
        assert.ok(exportMesh(body).triangles.length > 0, "Export is closed and oriented");
        assert.ok(body.faces.every((face) => face.vertices.length >= 9));
        assert.equal((await owner.call({ kind: "accept" })).error, undefined);
        const accepted = owner.view.data;
        assert.equal((await owner.call({ kind: "undo" })).error, undefined);
        assert.deepEqual(owner.view.data, before);
        assert.equal((await owner.call({ kind: "redo" })).error, undefined);
        assert.deepEqual(owner.view.data, accepted);
        assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
        assert.ok(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - body.volume) < 1e-8);
      } finally {
        owner.close();
      }
    });
  }
}
