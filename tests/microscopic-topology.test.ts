import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { finish, prism, square, vertical } from "./body-edge-fixtures.js";

function noShortEdges(body: Body) {
  for (const edge of body.edges) {
    assert.ok(edge.signature[2] >= 0.001, "Exact edge length meets the minimum extent");
    if (edge.curve?.kind !== "line") continue;
    const { a, b } = edge.curve;
    assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) >= 0.001);
  }
}

for (const size of [0.0005, 19.9995]) {
  test(`chamfer ${size} leaves usable topology and preserves atomic Undo`, async () => {
    const owner = new DocumentOwner();
    try {
      const box = await prism(owner, square);
      const original = owner.view.data;
      const body = await finish(owner, box, [vertical(box, 0, 0)], size, "chamfer");
      assert.equal(owner.view.edgeSize, size < 0.001 ? 0 : size);
      assert.equal(body.faces.length, size < 1 ? 6 : 5);
      noShortEdges(body);
      const expected = size < 1 ? 4000 : ((40 - size) ** 2 / 2) * 10;
      assert.ok(Math.abs(body.volume - expected) < 1e-6, `${body.volume} != ${expected}`);
      assert.deepEqual(owner.view.data, original, "Preview cannot mutate accepted geometry");
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      if (size < 0.001) {
        assert.equal(accepted, original, "Sub-resolution entry remains a no-op");
        return;
      }
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, original);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
      assert.equal(owner.view.data.bodies?.[0].faces.length, body.faces.length);
      const cap = body.faces.find((face) => face.plane?.origin[2] === 10);
      assert.ok(cap);
      const offset = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: cap.id }], distance: 1 },
      });
      assert.equal(offset.error, undefined);
      assert.ok(Math.abs((offset.view.candidate?.bodies?.[0].volume ?? 0) - expected * 1.1) < 1e-5);
      if (size > 1) {
        await owner.call({ kind: "discard" });
        const rounded = await finish(owner, body, [vertical(body, size - 20, 20)], 0.5);
        assert.ok(rounded.volume < body.volume, "The reconciled edge supports further editing");
      }
    } finally {
      owner.close();
    }
  });
}

test("extrusion removes a sub-micron collinear boundary span without changing accepted sketch curves", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [0.0005, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ]);
    assert.equal(body.faces.length, 6);
    assert.ok(Math.abs(body.volume - 4000) < 1e-6);
    noShortEdges(body);
    assert.equal(owner.view.data.sketches[0].curves.length, 5);
  } finally {
    owner.close();
  }
});

test("ordinary above-threshold chamfer subdivisions survive automatic repair", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    const body = await finish(owner, box, [vertical(box, 0, 0)], 0.002, "chamfer");
    assert.equal(body.faces.length, 7);
    assert.ok(Math.abs(body.volume - (4000 - (0.002 ** 2 / 2) * 10)) < 1e-6);
  } finally {
    owner.close();
  }
});

test("maximum edge finishes include microscopic repair in their feasibility search", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    for (const mode of ["fillet", "chamfer"] as const) {
      const body = await finish(owner, box, [vertical(box, 0, 0)], 1e6, mode);
      assert.ok((owner.view.edgeSize ?? 0) > 19.9);
      noShortEdges(body);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});

test("an unrepairable microscopic solid rejects without modifying accepted geometry", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    const original = owner.view.data;
    const reply = await owner.call({
      kind: "scale",
      operation: {
        kind: "solids",
        ids: [box.id],
        faces: [],
        edges: [],
        pivot: [0, 0, 0],
        factor: 0.000025,
      },
    });
    assert.ok(reply.error);
    assert.deepEqual(owner.view.data, original);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("deferred mesh and completed exact topology share the repaired chamfer", async () => {
  const owner = new DocumentOwner();
  try {
    const box = await prism(owner, square);
    const preview = await owner.call({
      kind: "finish-edges",
      operation: {
        edges: [{ body: box.id, edge: vertical(box, 0, 0).id }],
        mode: "chamfer",
        size: 19.9995,
      },
      presentation: "deferred",
    });
    assert.equal(preview.error, undefined);
    const visual = preview.view.visualPreview?.bodies[0];
    assert.ok(visual);
    assert.equal(visual.faces.length, 5);
    const completed = await owner.call({ kind: "complete-preview" });
    assert.equal(completed.error, undefined);
    const body = completed.view.candidate?.bodies?.[0];
    assert.ok(body);
    assert.deepEqual(
      visual.faces,
      body.faces.map((face) => face.vertices),
    );
    noShortEdges(body);
  } finally {
    owner.close();
  }
});
