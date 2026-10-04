import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/erosion-pierced-fillet.json", "utf8")) as {
  document: SketchDocument;
};

test("Fast preserves the captured chambers and small pieces at an explicit target depth", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const source = before.bodies?.[0];
    assert(source);
    const reply = await owner.call({
      kind: "erode",
      operation: { ids: [source.id], thickness: 3.8, method: "fast" },
    });
    assert.equal(reply.error, undefined);
    assert.equal(owner.view.data, before);
    const pieces = reply.view.candidate?.bodies?.filter((body) => body.id !== source.id);
    assert(pieces && pieces.length === 4);
    assert.equal(pieces.filter((body) => body.volume > 700).length, 2);
    assert(reply.view.erosionQuality?.[0].sampledFitDeviation);
    assert(pieces.some((body) => body.center[0] < 0));
    assert(pieces.some((body) => body.center[0] > 0));
    for (const body of pieces) {
      assert(body.volume > 0 && body.faces.length <= 8);
      assert(body.faces.some((face) => !face.plane && !face.sphere && !face.cylinder));
      assert(body.faces.every((face) => !source.faces.some((old) => old.id === face.id)));
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    for (const piece of pieces) {
      const reopened = owner.view.data.bodies?.find((body) => body.id === piece.id);
      assert(reopened);
      assert.deepEqual(
        reopened.faces.map((face) => face.id),
        piece.faces.map((face) => face.id),
      );
      assert(Math.abs(reopened.volume - piece.volume) < 1e-7);
    }
    const cut = await owner.call({
      kind: "boolean-bodies",
      operation: {
        ids: [source.id, ...pieces.map((body) => body.id)],
        mode: "subtract",
        keepOriginals: false,
      },
    });
    assert.equal(cut.error, undefined);
    const walls = cut.view.candidate?.bodies;
    assert(walls && walls.length === 1);
    const expected = source.volume - pieces.reduce((sum, body) => sum + body.volume, 0);
    assert(Math.abs(walls[0].volume - expected) < 1e-3);
    await owner.call({ kind: "accept" });
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
    assert(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - expected) < 1e-3);
  } finally {
    owner.close();
  }
});
