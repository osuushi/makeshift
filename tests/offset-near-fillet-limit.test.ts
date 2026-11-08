import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/offset-near-fillet-limit.json", "utf8"),
) as { body: Body; face: string };

test("captured near-limit offset removes microscopic fillets globally and keeps shared boundaries measurable", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal(
      (
        await owner.call({
          kind: "open",
          document: { units: "mm", sketches: [], bodies: [fixture.body] },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const reply = await owner.call({
      kind: "offset-faces",
      operation: {
        faces: [{ body: fixture.body.id, face: fixture.face }],
        distance: -5.999267578125,
        limit: false,
      },
    });
    assert.equal(reply.error, undefined);
    const body = reply.view.candidate?.bodies?.[0];
    assert.ok(body);
    assert.equal(body.faces.length, 6);
    assert.equal(body.edges.length, 12);
    for (const edge of body.edges) {
      assert.equal(
        body.faces.filter((f) => f.edges.includes(edge.id)).length,
        2,
        "Both sides share one exact edge",
      );
      assert.ok(edge.signature[2] > 0.001);
    }
    const expected = (20 - 5.999267578125) * (20 - 2 * 5.999267578125) * 10;
    assert.ok(Math.abs(body.volume - expected) < 1e-6);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    for (let i = 0; i < body.edges.length; i++)
      for (let j = i + 1; j < body.edges.length; j++) {
        const measured = await owner.call({
          kind: "measure",
          targets: [body.edges[i], body.edges[j]].map((e) => ({
            kind: "edge",
            body: body.id,
            edge: e.id,
          })),
        });
        assert.equal(measured.error, undefined);
        assert.ok(Number.isFinite(measured.measurement?.distance?.value));
      }
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, before);
    assert.deepEqual((await owner.call({ kind: "redo" })).view.data, accepted);
  } finally {
    owner.close();
  }
});
