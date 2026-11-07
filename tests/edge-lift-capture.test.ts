import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { EdgeMovement } from "../src/model/body.js";
import { documentArchive, readArchive } from "../src/model/document-archive.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/edge-lift-closed-spline.json", "utf8")) as {
  document: SketchDocument;
  operation: EdgeMovement;
};

// Founder capture: opposite analytic/spline rim directions and a two-part seam
// made individually valid periodic faces form an invalid shell or lose an edge.
test("lift a captured spline rim while retaining its split seam, boundary directions and Undo", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const body = before.bodies?.[0];
    assert.ok(body);
    const selected = body.edges.find((edge) => edge.id === fixture.operation.edges[0].edge);
    assert.ok(selected?.landmarks?.closed);
    const junction = selected.landmarks.start;
    for (const distance of [0.1, 0.8, 2, -0.8]) {
      const result = await owner.call({
        kind: "move-edges",
        operation: { ...fixture.operation, translation: [0, 0, distance] },
      });
      assert.equal(result.error, undefined, `distance ${distance}: ${result.error}`);
      const moved = result.view.candidate?.bodies?.[0];
      assert.ok(moved);
      assert.deepEqual(result.view.data, before);
      assert.deepEqual(moved.faces.map((f) => f.id).sort(), body.faces.map((f) => f.id).sort());
      assert.deepEqual(moved.edges.map((e) => e.id).sort(), body.edges.map((e) => e.id).sort());
      const rim = moved.edges.find((e) => e.id === selected.id);
      assert.ok(rim?.landmarks?.closed);
      assert.ok(Math.abs(rim.signature[2] - selected.signature[2]) < 1e-6);
      for (let i = 2; i < rim.points.length; i += 3)
        assert.ok(Math.abs(rim.points[i] - selected.points[2] - distance) < 1e-6);
      for (const edge of body.edges) {
        const next = moved.edges.find((e) => e.id === edge.id);
        assert.ok(next?.landmarks && edge.landmarks);
        for (const key of ["start", "end"] as const) {
          const p = edge.landmarks[key],
            q = next.landmarks[key];
          const attached = Math.hypot(...p.map((n, i) => n - junction[i])) < 1e-6;
          for (let i = 0; i < 3; ++i)
            assert.ok(Math.abs(q[i] - p[i] - (attached && i === 2 ? distance : 0)) < 1e-6);
        }
      }
      assert.ok(
        (moved.volume - body.volume) * distance < 0,
        "Lifting the shoulder removes material",
      );
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal(
      (await owner.call({ kind: "open", document: readArchive(documentArchive(accepted)) })).error,
      undefined,
    );
    assert.equal(
      (await owner.call({ kind: "move-edges", operation: fixture.operation })).error,
      undefined,
    );
    await owner.call({ kind: "cancel-preview" });
    assert.equal(owner.view.candidate, null);
  } finally {
    owner.close();
  }
});
