import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/chamfer-segmented-shelf.json", "utf8")) as {
  document: SketchDocument;
};
const rims = [
  "55ae351e-f9c8-41e8-88e7-d153b70b2e8a",
  "a1e796be-7a08-446e-bddf-86f9538cdeaa",
  "7876944f-4387-4579-8789-df0024e295a6",
  "994e20e4-4c5f-49c7-a90b-c829d09666c4",
];

test("captured segmented shelf accepts a fillet and retains editable, persistent topology", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const source = before.bodies?.[0];
    assert.ok(source);
    const reply = await owner.call({
      kind: "finish-edges",
      operation: {
        edges: rims.map((edge) => ({ body: source.id, edge })),
        size: 0.5,
        mode: "fillet",
        limit: false,
      },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.edgeSize, 0.5);
    const body = reply.view.candidate?.bodies?.[0];
    assert.ok(body);
    assert.ok(body.volume < source.volume);
    assert.ok(body.edges.every((edge) => edge.signature[2] >= 0.001));
    assert.ok(body.faces.every((face) => face.vertices.length > 0));
    assert.deepEqual(owner.view.data, before);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
    assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    assert.equal(owner.view.data.bodies?.[0].faces.length, body.faces.length);
    assert.ok(Math.abs((owner.view.data.bodies?.[0].volume ?? 0) - body.volume) < 1e-7);
    const beforeMove = owner.view.data;
    const moved = await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [body.id],
        axis: [1, 2, 3],
        angle: 23,
        pivot: [0, 0, 0],
        translation: [31, -17, 9],
        duplicate: false,
      },
    });
    assert.equal(moved.error, undefined);
    const movedBody = moved.view.data.bodies?.[0];
    assert.ok(movedBody);
    assert.deepEqual(
      movedBody.faces.map((face) => face.id).sort(),
      body.faces.map((face) => face.id).sort(),
    );
    assert.deepEqual(
      movedBody.edges.map((edge) => edge.id).sort(),
      body.edges.map((edge) => edge.id).sort(),
    );
    assert.ok(Math.abs(movedBody.volume - body.volume) < 1e-5);
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, beforeMove);
  } finally {
    owner.close();
  }
});
