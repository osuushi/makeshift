import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { exportMesh } from "../src/model/export-mesh.js";
import { curveIntersections } from "../src/sketch/curve-intersections.js";
import type { SketchDocument } from "../src/sketch/document.js";
import type { ModelRequest } from "../src/sketch/model-api.js";
import { profileAt, profilesFor } from "../src/sketch/profiles.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/delete-pen-overlap.json", "utf8")) as {
  document: SketchDocument;
  deletion: Extract<ModelRequest, { kind: "delete-entities" }>;
};

test("stationary Pen curves intersect at their exact shared endpoint in either order", () => {
  const [, a, , b] = fixture.document.sketches[0].curves;
  assert.ok(a.kind === "bezier" && b.kind === "bezier");
  for (const [first, second] of [
    [a, b],
    [{ ...a, c1: { x: 1.5, y: 3 } }, b],
    [a, { ...b, c2: { x: 2.5, y: 1 } }],
  ]) {
    assert.deepEqual(curveIntersections(first, second), [a.a]);
    assert.deepEqual(curveIntersections(second, first), [a.a]);
  }
});

test("captured circle/Pen overlap deletes into a closed union, with history and extrusion", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const before = owner.view.data;
    const area = profilesFor(before.sketches[0]).reduce((sum, profile) => sum + profile.area, 0);
    assert.equal((await owner.call(fixture.deletion)).error, undefined);
    const after = owner.view.data;
    const profiles = profilesFor(after.sketches[0]);
    assert.equal(profiles.length, 1);
    for (const y of [-1e-8, 0, 1e-8])
      assert.equal(profileAt(after.sketches[0], { x: -8, y })?.key, profiles[0].key);
    assert.ok(Math.abs(profiles[0].area - area) < 1e-6);
    assert.equal(after.sketches[0].curves.length, 4, "No microscopic endpoint remnant");
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, after);
    assert.equal((await owner.call({ kind: "open", document: after })).error, undefined);
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: after.sketches[0].id, profile: profiles[0].key }],
        distance: 16,
        symmetric: false,
        draft: { mode: "angle", value: 0 },
        mode: "new",
        eligibleTargets: [],
      },
    });
    assert.equal(reply.error, undefined);
    const body = reply.view.candidate?.bodies?.[0];
    assert.ok(body);
    assert.ok(Math.abs(body.volume - area * 16) < 1e-5);
    assert.ok(exportMesh(body).triangles.length > 0);
  } finally {
    owner.close();
  }
});
