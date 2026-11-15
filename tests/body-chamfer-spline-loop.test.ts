import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/chamfer-spline-loop.json", "utf8"),
) as SketchDocument;

async function nearestChamfer(owner: DocumentOwner, body: string, selected: readonly string[]) {
  const nearest = await owner.call({
    kind: "finish-edges",
    operation: {
      edges: selected.map((edge) => ({ body, edge })),
      mode: "chamfer",
      size: 22.9687,
      limit: true,
    },
  });
  assert.equal(nearest.error, undefined);
  assert.ok(
    nearest.view.edgeSize && nearest.view.edgeSize >= 20 && nearest.view.edgeSize < 22.9687,
  );
}

test("a looping chamfer is refused before acceptance and the other captured body stays editable", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture })).error, undefined);
    const original = owner.view.data;
    const [cylinder, stock] = original.bodies ?? [];
    const face = stock.faces.find((face) => face.id === "f3");
    assert.ok(face);
    const edges = face.edges.map((edge) => ({ body: stock.id, edge }));
    const rejected = await owner.call({
      kind: "finish-edges",
      operation: { edges, mode: "chamfer", size: 22.9687, limit: false },
      presentation: "deferred",
    });
    assert.match(rejected.error ?? "", /not feasible/);
    assert.equal(rejected.view.candidate, null);
    assert.equal(owner.view.data, original);

    const smaller = await owner.call({
      kind: "finish-edges",
      operation: { edges, mode: "chamfer", size: 20, limit: false },
    });
    assert.equal(smaller.error, undefined);
    assert.equal(smaller.view.edgeSize, 20);
    await nearestChamfer(owner, stock.id, face.edges);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.ok((accepted.bodies?.[1].volume ?? Infinity) < stock.volume);
    assert.equal(accepted.bodies?.[0], cylinder);
    await owner.call({ kind: "undo" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.equal(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);

    const wall = cylinder.faces.find((face) => face.cylinder);
    assert.ok(wall?.cylinder);
    const radius = wall.cylinder.radius;
    const offset = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: cylinder.id, face: wall.id }], distance: 1, limit: false },
    });
    assert.equal(offset.error, undefined);
    assert.ok(
      Math.abs(
        (offset.view.candidate?.bodies?.[0].volume ?? 0) - Math.PI * (radius + 1) ** 2 * 81,
      ) < 1e-5,
    );
    await owner.call({ kind: "cancel-preview" });

    const cap = cylinder.faces.find((face) => face.id === "144cd99d-0cfa-45d3-8bee-db0eac9d7294");
    assert.ok(cap?.plane);
    const extruded = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ face: cap.id }],
        distance: -1,
        mode: "auto",
        eligibleTargets: accepted.bodies?.map((body) => body.id),
      },
    });
    assert.equal(extruded.error, undefined);
    const shortened = extruded.view.candidate?.bodies?.find((body) =>
      body.faces.some((face) => face.cylinder?.radius === radius),
    );
    assert.ok(shortened);
    assert.ok(Math.abs(shortened.volume - Math.PI * radius ** 2 * 80) < 1e-5);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.equal((await owner.call({ kind: "open", document: owner.view.data })).error, undefined);
  } finally {
    owner.close();
  }
});
