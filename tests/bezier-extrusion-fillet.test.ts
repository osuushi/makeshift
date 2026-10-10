import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture: { document: SketchDocument; selection: { body: string; edge: string }[] } =
  JSON.parse(readFileSync("tests/fixtures/bezier-extrusion-fillet.json", "utf8"));

test("captured collapsed-handle Bezier extrusion fillets its corner without replaying its sketch", async () => {
  const owner = new DocumentOwner();
  try {
    // The materialized solid must work even when its source sketch is absent.
    const document = { ...fixture.document, sketches: [] };
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    const operation = { edges: fixture.selection, mode: "fillet" as const };
    const selected = await owner.call({ kind: "edge-finish-selection", operation });
    assert.equal(selected.error, undefined);
    assert.deepEqual(selected.view.edgeSelection, fixture.selection);
    assert.equal(owner.view.data, original);
    const reply = await owner.call({
      kind: "finish-edges",
      operation: { ...operation, size: 0.1 },
    });
    assert.equal(reply.error, undefined);
    assert.equal(reply.view.edgeSize, 0.1);
    const rounded = reply.view.candidate?.bodies?.[0];
    assert.ok(rounded);
    assert.equal(rounded.id, body.id);
    assert.ok(rounded.volume < body.volume && rounded.volume > body.volume - 0.1);
    assert.equal(rounded.faces.length, body.faces.length + 1);
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
  } finally {
    owner.close();
  }
});

test("captured Bezier corners round together while rejected smooth junctions preserve the solid", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const body = original.bodies?.[0];
    assert.ok(body);
    const corners = body.edges.filter(
      (edge) => edge.curve?.kind === "line" && Math.abs(Math.abs(edge.curve.a[0]) - 5) < 1e-7,
    );
    assert.equal(corners.length, 2);
    const reply = await owner.call({
      kind: "finish-edges",
      operation: {
        edges: corners.map((edge) => ({ body: body.id, edge: edge.id })),
        size: 0.1,
        mode: "fillet",
      },
    });
    assert.equal(reply.error, undefined);
    const rounded = reply.view.candidate?.bodies?.[0];
    assert.ok(rounded);
    assert.ok(rounded.volume < body.volume && rounded.volume > body.volume - 0.1);
    assert.equal(rounded.faces.length, body.faces.length + 2);
    for (const index of [1, 2, 5])
      assert.ok(Math.abs(rounded.bounds[index] - body.bounds[index]) < 1e-6);
    await owner.call({ kind: "discard" });
    const smooth = body.edges.find((edge) => edge.curve?.kind === "line" && edge.curve.a[1] < -8);
    assert.ok(smooth);
    const rejected = await owner.call({
      kind: "edge-finish-selection",
      operation: { edges: [{ body: body.id, edge: smooth.id }], mode: "fillet" },
    });
    assert.match(rejected.error ?? "", /cannot be rounded/);
    assert.equal(owner.view.data, original);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});
