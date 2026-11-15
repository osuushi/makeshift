import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { Sketch } from "../src/sketch/document.js";
import { finish, vertical } from "./body-edge-fixtures.js";

async function capturedStock(owner: DocumentOwner) {
  const sketch = JSON.parse(
    readFileSync("tests/fixtures/fillet-overlapping-corner-sketch.json", "utf8"),
  ) as Sketch;
  assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: `${sketch.id}/0` }],
          distance: 24.5,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
  // Reconstruct the three accepted edits preceding the captured 4 mm top rim.
  for (const [radius, corners] of [
    [2, [[18.5, -20.5]]],
    [
      2.5,
      [
        [33, 1],
        [33, -12],
      ],
    ],
    [1, [[18.5, 13.5]]],
  ] as const) {
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    await finish(
      owner,
      body,
      corners.map(([x, y]) => vertical(body, x, y)),
      radius,
    );
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
  }
  const body = owner.view.data.bodies?.[0];
  assert.ok(body);
  const rim = body.edges.filter((edge) =>
    edge.points.every((value, i) => i % 3 !== 2 || Math.abs(value - 24.5) < 1e-7),
  );
  assert.equal(rim.length, 16);
  return rim.map((edge) => ({ body: body.id, edge: edge.id }));
}

test("overlapping fillet corners reject before deferred publication and nearest stays undoable", async () => {
  const owner = new DocumentOwner();
  try {
    const edges = await capturedStock(owner);
    const original = owner.view.data;
    const operation = { edges, mode: "fillet" as const, size: 4, limit: false };
    // Previously accepted volume: 30954.566272507363 mm³, despite intersecting
    // faces/edges. Closed mesh incidence and individual trim-loop checks pass.
    const rejected = await owner.call({
      kind: "finish-edges",
      operation,
      presentation: "deferred",
    });
    assert.match(rejected.error ?? "", /not feasible/);
    assert.equal(rejected.view.candidate, null);
    assert.equal(owner.view.data, original);
    const smaller = await owner.call({
      kind: "finish-edges",
      operation: { ...operation, size: 3 },
    });
    assert.equal(smaller.error, undefined);
    assert.equal(smaller.view.edgeSize, 3);
    const body = smaller.view.candidate?.bodies?.[0];
    assert.ok(body);
    assert.ok(Math.abs(body.volume - 31162.79288213605) < 1e-6);
    assert.ok(exportMesh(body).triangles.length > 0);
    const nearest = await owner.call({
      kind: "finish-edges",
      operation: { ...operation, limit: true },
    });
    assert.equal(nearest.error, undefined);
    assert.ok(nearest.view.edgeSize && nearest.view.edgeSize >= 3 && nearest.view.edgeSize < 4);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.notEqual(accepted, original);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});
