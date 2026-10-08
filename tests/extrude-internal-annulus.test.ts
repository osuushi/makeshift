import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Extrusion } from "../src/model/body.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";

const fixture = JSON.parse(
  readFileSync("tests/fixtures/extrude-internal-annulus.json", "utf8"),
) as { document: SketchDocument; extrusion: Extrusion };
// The captured bottom annulus has radii 8 and 6 mm. Its third wire is
// an INTERNAL edge left by an earlier edit, not another material boundary.
const area = Math.PI * (8 ** 2 - 6 ** 2);
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected}`);

function checkPrism(body: Body, distance: number, symmetric: boolean) {
  near(body.volume, area * Math.abs(distance));
  near(body.bounds[2], symmetric ? -Math.abs(distance) / 2 : Math.min(0, -distance));
  near(body.bounds[5], symmetric ? Math.abs(distance) / 2 : Math.max(0, -distance));
  assert.equal(body.faces.length, 4, "Only the two rims create side walls");
  assert.ok(exportMesh(body).triangles.length > 0, "Result exports as a closed mesh");
}

for (const symmetric of [false, true])
  for (const distance of [8, -8])
    test(`captured internally imprinted annulus sweeps ${distance} mm, symmetric=${symmetric}`, async () => {
      const owner = new DocumentOwner();
      try {
        assert.equal(
          (await owner.call({ kind: "open", document: fixture.document })).error,
          undefined,
        );
        const before = owner.view.data;
        const source = before.bodies?.[0];
        assert.ok(source);
        const selected = fixture.extrusion.sources[0];
        assert.ok("face" in selected);
        const face = source.faces.find((face) => face.id === selected.face);
        assert.equal(face?.edges.length, 3, "Capture retains the internal source edge");
        const extrusion = { ...fixture.extrusion, distance, symmetric, mode: "new" as const };
        assert.equal((await owner.call({ kind: "extrude", extrusion })).error, undefined);
        assert.deepEqual(owner.view.data, before);
        const result = owner.view.candidate?.bodies?.at(-1);
        assert.ok(result);
        checkPrism(result, distance, symmetric);
        await owner.call({ kind: "cancel-preview" });
        assert.deepEqual(owner.view.data, before);
        assert.equal((await owner.call({ kind: "extrude", extrusion })).error, undefined);
        assert.equal((await owner.call({ kind: "accept" })).error, undefined);
        const accepted = owner.view.data;
        assert.deepEqual(accepted.bodies?.[0], source, "Source BRep and topology stay untouched");
        await owner.call({ kind: "undo" });
        assert.deepEqual(owner.view.data, before);
        await owner.call({ kind: "redo" });
        assert.deepEqual(owner.view.data, accepted);
        assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
        checkPrism(owner.view.data.bodies?.at(-1) as Body, distance, symmetric);
      } finally {
        owner.close();
      }
    });

test("captured Auto extrusion adds the annular extension and supports subsequent movement", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion: fixture.extrusion })).error,
      undefined,
    );
    assert.deepEqual(owner.view.data, before);
    const result = owner.view.candidate?.bodies?.[0];
    assert.ok(result);
    near(result.volume, (before.bodies?.[0].volume ?? 0) + area * 8);
    assert.equal(owner.view.candidate?.bodies?.length, 1);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    assert.equal(
      (
        await owner.call({
          kind: "transform-bodies",
          transform: {
            ids: [result.id],
            axis: [0, 0, 1],
            angle: 0,
            pivot: [0, 0, 0],
            translation: [3, 4, 5],
            duplicate: false,
          },
        })
      ).error,
      undefined,
    );
    const moved = owner.view.data.bodies?.[0];
    assert.ok(moved);
    near(moved.volume, result.volume);
    near(moved.bounds[2], -3);
    assert.ok(exportMesh(moved).triangles.length > 0);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, accepted);
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("revolve and loft use material boundaries of internally imprinted face profiles", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const source = before.bodies?.[0];
    assert.ok(source);
    const floor = source.faces.find((face) => face.plane?.origin[2] === 2);
    assert.ok(floor);
    assert.equal(floor.edges.length, 3, "Second section also retains an internal edge");
    const revolution = await owner.call({
      kind: "revolve",
      revolution: {
        sources: fixture.extrusion.sources,
        axis: { origin: [20, 0, 0], direction: [0, 1, 0] },
        angle: 360,
        height: 0,
        mode: "new",
      },
    });
    assert.equal(revolution.error, undefined);
    const revolved = owner.view.candidate?.bodies?.at(-1);
    assert.ok(revolved);
    near(revolved.volume, 2 * Math.PI * 20 * area);
    assert.ok(exportMesh(revolved).triangles.length > 0);
    await owner.call({ kind: "cancel-preview" });
    const loft = await owner.call({
      kind: "loft",
      operation: {
        sources: [...fixture.extrusion.sources, { face: floor.id }],
        ruled: true,
        mode: "new",
      },
    });
    assert.equal(loft.error, undefined);
    const lofted = owner.view.candidate?.bodies?.at(-1);
    assert.ok(lofted);
    near(lofted.volume, area * 2);
    assert.ok(exportMesh(lofted).triangles.length > 0);
    assert.deepEqual(owner.view.data, before);
  } finally {
    owner.close();
  }
});
