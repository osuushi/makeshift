import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { planeCutEdges } from "../src/model/plane-cut-edges.js";
import { fixture } from "./face-cut-fixtures.js";
import { middleCut, planeCutFixture } from "./plane-cut-fixture.js";

test("Imprint highlights new edges even when another target already has coincident borders", async () => {
  const owner = new DocumentOwner();
  try {
    const upper = await planeCutFixture(owner);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [upper.id],
            duplicate: true,
            translation: [0, 0, -10],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
          },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    const operation = {
      mode: "imprint" as const,
      targets: (before.bodies ?? []).map((body) => ({ body: body.id })),
      frame: middleCut,
    };
    assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
    assert.ok(owner.view.candidate);
    const edges = planeCutEdges(owner.view.candidate, owner.view.cutEdges ?? []);
    assert.equal(edges.length, 4, "All four newly imprinted box edges must be highlighted");
    assert.ok(edges.every(({ body }) => body.id === upper.id));
    for (const { edge } of edges)
      for (let i = 2; i < edge.points.length; i += 3)
        assert.ok(Math.abs(edge.points[i] - 10) < 1e-5);
    assert.deepEqual(owner.view.data, before, "Inspecting highlights never accepts geometry");
  } finally {
    owner.close();
  }
});

for (const mode of ["split", "imprint"] as const)
  test(`${mode}: exact curved intersections are highlighted without periodic seams or split boundary fragments`, async () => {
    const owner = new DocumentOwner();
    try {
      const { target, surface } = await fixture(owner);
      const before = owner.view.data;
      assert.equal(
        (
          await owner.call({
            kind: "plane-cut",
            operation: { mode, targets: [{ body: target.id }], surface },
          })
        ).error,
        undefined,
      );
      assert.ok(owner.view.candidate);
      const edges = planeCutEdges(owner.view.candidate, owner.view.cutEdges ?? []);
      assert.equal(edges.length, mode === "split" ? 4 : 2);
      assert.ok(edges.every(({ edge }) => edge.curve?.kind === "circle"));
      assert.deepEqual(owner.view.data, before);
      const ids = owner.view.cutEdges;
      await owner.call({ kind: "accept" });
      assert.equal(owner.view.cutEdges, undefined);
      await owner.call({ kind: "reopen" });
      assert.deepEqual(owner.view.cutEdges, ids, "Reopen restores the exact highlighted IDs");
      await owner.call({ kind: "discard" });
      assert.equal(owner.view.cutEdges, undefined);
    } finally {
      owner.close();
    }
  });
