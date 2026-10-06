import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import { featureEdges } from "../src/model/feature-edges.js";
import { planeCutEdges } from "../src/model/plane-cut-edges.js";
import { planeCutFixture as fixture, middleCut as middle } from "./plane-cut-fixture.js";

test("construction planes validate, persist, undo and never move existing sketches", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await fixture(owner);
    const before = owner.view.data;
    assert.equal(
      (await owner.call({ kind: "construction-plane", plane: { id: "p", frame: middle } })).error,
      undefined,
    );
    await owner.call({
      kind: "construction-plane",
      plane: { id: "p", frame: { ...middle, origin: [0, 0, 30] } },
    });
    assert.deepEqual(owner.view.data.sketches, before.sketches);
    assert.equal(owner.view.data.bodies?.[0].brep, body.brep);
    const saved = owner.view.data;
    await owner.call({ kind: "delete-plane", id: "p" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, saved);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(saved)) })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data.constructionPlanes, saved.constructionPlanes);
    assert.ok(
      (await owner.call({ kind: "construction-plane", plane: { id: body.id, frame: middle } }))
        .error,
    );
  } finally {
    owner.close();
  }
});
for (const kind of ["box", "cylinder", "hollow", "partial"])
  test(`${kind}: split conserves volume; imprint retains body and supports through history/archive`, async () => {
    const owner = new DocumentOwner();
    try {
      const body = await fixture(owner, kind),
        before = owner.view.data;
      const split = { mode: "split" as const, targets: [{ body: body.id }], frame: middle };
      assert.equal((await owner.call({ kind: "plane-cut", operation: split })).error, undefined);
      const pieces = owner.view.candidate?.bodies;
      assert.equal(pieces?.length, 2);
      assert.ok(owner.view.candidate);
      const splitEdges = planeCutEdges(owner.view.candidate, owner.view.cutEdges ?? []);
      assert.ok(splitEdges.length > 0, "Split exposes new section borders");
      if (kind === "box") assert.equal(splitEdges.length, 8);
      assert.ok(Math.abs((pieces ?? []).reduce((n, b) => n + b.volume, 0) - body.volume) < 1e-6);
      await owner.call({ kind: "discard" });
      assert.deepEqual(owner.view.data, before);
      const operation = { ...split, mode: "imprint" as const };
      assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
      const result = owner.view.candidate?.bodies?.[0];
      assert.ok(result);
      assert.equal(result.id, body.id);
      assert.ok(result.faces.length > body.faces.length);
      assert.ok(owner.view.candidate);
      const imprintEdges = planeCutEdges(owner.view.candidate, owner.view.cutEdges ?? []);
      assert.ok(imprintEdges.length > 0);
      if (kind === "box") assert.equal(imprintEdges.length, 4);
      for (const { edge } of imprintEdges)
        for (let i = 2; i < edge.points.length; i += 3)
          assert.ok(Math.abs(edge.points[i] - 10) < 1e-5);
      assert.ok(Math.abs(result.volume - body.volume) < 1e-6);
      const oldEdges = new Set(body.edges.map((e) => e.id));
      assert.ok(featureEdges(result).some((e) => !oldEdges.has(e.id)));
      await owner.call({ kind: "accept" });
      const accepted = owner.view.data;
      await owner.call({ kind: "undo" });
      assert.deepEqual(owner.view.data, before);
      await owner.call({ kind: "redo" });
      assert.deepEqual(owner.view.data, accepted);
      assert.equal(
        (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) }))
          .error,
        undefined,
      );
      assert.deepEqual(
        owner.view.data.bodies?.[0].edges.map((e) => e.id),
        result.edges.map((e) => e.id),
      );
      assert.equal(owner.view.data.bodies?.[0].faces.length, result.faces.length);
      for (const z of [0, 20, 30]) {
        const unchanged = owner.view.data;
        assert.equal(
          (
            await owner.call({
              kind: "plane-cut",
              operation: { ...operation, frame: { ...middle, origin: [0, 0, z] } },
            })
          ).error,
          undefined,
        );
        assert.deepEqual(owner.view.candidate, unchanged);
        await owner.call({ kind: "discard" });
      }
      if (kind === "box") {
        const imprinted = owner.view.data;
        assert.equal((await owner.call({ kind: "plane-cut", operation: split })).error, undefined);
        assert.ok(owner.view.candidate);
        assert.equal(
          planeCutEdges(owner.view.candidate, owner.view.cutEdges ?? []).length,
          8,
          "Split highlights both sets of borders even after Imprint",
        );
        assert.deepEqual(owner.view.data, imprinted);
      }
    } finally {
      owner.close();
    }
  });
test("imprint a face subset and reject invalid multi-body input atomically", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await fixture(owner);
    const face = body.faces.find(
      (f) => f.plane && Math.abs(f.plane.u[2]) + Math.abs(f.plane.v[2]) > 0.5,
    );
    assert.ok(face);
    const operation = {
      mode: "imprint" as const,
      targets: [{ body: body.id, faces: [face.id] }],
      frame: middle,
    };
    assert.equal((await owner.call({ kind: "plane-cut", operation })).error, undefined);
    const result = owner.view.candidate?.bodies?.[0];
    assert.ok(result);
    assert.equal(result.faces.length, 7);
    for (const original of body.faces.filter((f) => f.id !== face.id))
      assert.ok(result.faces.some((f) => f.id === original.id));
    await owner.call({ kind: "discard" });
    const before = owner.view.data;
    assert.ok(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            ...operation,
            targets: [...operation.targets, { body: "missing", faces: [] }],
          },
        })
      ).error,
    );
    assert.deepEqual(owner.view.data, before);
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});

test("oblique cuts and twisted spline support imprint use adaptive volume validation", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await fixture(owner, "twisted");
    for (const mode of ["split", "imprint"] as const) {
      const frame = {
        origin: [0, 0, 10] as [number, number, number],
        u: [1, 0, 0] as [number, number, number],
        v: [0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number],
      };
      const reply = await owner.call({
        kind: "plane-cut",
        operation: { mode, targets: [{ body: body.id }], frame },
      });
      assert.equal(reply.error, undefined);
      assert.ok(reply.view.candidate);
      assert.ok((reply.view.candidate.bodies?.length ?? 0) > 0);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});

test("multiple bodies split together with distinct topology IDs", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await fixture(owner);
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [body.id],
            duplicate: true,
            translation: [30, 0, 0],
            pivot: [0, 0, 0],
            axis: [0, 0, 1],
            angle: 0,
          },
        })
      ).error,
      undefined,
    );
    const before = owner.view.data;
    assert.equal(
      (
        await owner.call({
          kind: "plane-cut",
          operation: {
            mode: "split",
            targets: (before.bodies ?? []).map((b) => ({ body: b.id })),
            frame: middle,
          },
        })
      ).error,
      undefined,
    );
    const result = owner.view.candidate?.bodies ?? [];
    assert.equal(result.length, 4);
    const ids = result.flatMap((b) => [
      b.id,
      ...b.faces.map((f) => f.id),
      ...b.edges.map((e) => e.id),
    ]);
    assert.equal(new Set(ids).size, ids.length);
    await owner.call({ kind: "accept" });
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
