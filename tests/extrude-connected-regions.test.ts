import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { exportMesh } from "../src/model/export-mesh.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { profilesFor } from "../src/sketch/profiles.js";

// Source sketch from Capture fixture 2026-10-25T15-46-13-704Z-88d653b1.
const document: SketchDocument = JSON.parse(
  readFileSync("tests/fixtures/extrude-connected-drain.json", "utf8"),
).document;
const near = (actual: number, expected: number) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-8 * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected}`,
  );
const caps = (body: Body, z: number) =>
  body.faces.filter(
    (face) =>
      face.plane &&
      Math.abs(face.plane.u[2]) < 1e-7 &&
      Math.abs(face.plane.v[2]) < 1e-7 &&
      Math.abs(face.plane.origin[2] - z) < 1e-7,
  );

test("changing the perforated drain depth preserves openings and reachable curved guides", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const before = owner.view.data;
    const sketch = before.sketches[0];
    const profile = profilesFor(sketch)[0];
    for (const distance of [5, 5.5, -7]) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: profile.key }],
          distance,
          mode: "new",
        },
      });
      assert.equal(reply.error, undefined);
      assert.deepEqual(owner.view.data, before);
      const body = reply.view.candidate?.bodies?.[0];
      assert.ok(body);
      near(body.volume, profile.area * Math.abs(distance));
      assert.equal(body.faces.length, 142);
      assert.equal(body.edges.length, 420);
      assert.equal(caps(body, 0).length, 1);
      assert.equal(caps(body, distance).length, 1);
      for (const cap of [...caps(body, 0), ...caps(body, distance)]) {
        assert.ok(cap.thickness);
        near(cap.thickness.distance, Math.abs(distance));
      }
      const curvedWalls = body.faces.filter(
        (face) => face.cylinder && Math.abs(face.cylinder.radius - 40) < 1e-7,
      );
      assert.equal(curvedWalls.length, 32);
      for (const face of curvedWalls) {
        const reference = body.faces.find((other) => other.id === face.thickness?.face);
        assert.ok(reference?.cylinder);
        near(reference.cylinder.radius, 20);
        near(face.thickness?.distance ?? 0, 20);
        // The facing arc is in the same angular sector, not a stationary
        // projection onto a trimmed arc on the opposite side of the drain.
        assert.ok(
          face.signature[3] * reference.signature[3] + face.signature[4] * reference.signature[4] >
            0,
        );
      }
      assert.ok(exportMesh(body).triangles.length > 0);
    }
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("connected drain regions form one partitioned prism within the preview budget", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const before = owner.view.data;
    const sketch = before.sketches[0];
    const profiles = profilesFor(sketch);
    assert.equal(profiles.length, 37);
    const start = performance.now();
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: profiles.map((profile) => ({ sketch: sketch.id, profile: profile.key })),
        distance: 5,
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 20_000, `Connected-region preview took ${elapsed.toFixed(0)} ms`);
    assert.deepEqual(owner.view.data, before);
    const bodies = reply.view.candidate?.bodies;
    assert.equal(bodies?.length, 1);
    const body = bodies[0];
    // 100 mm square with R2 corners. All 32 slots and four screw holes are filled.
    near(body.volume, (10000 - 4 * (4 - Math.PI)) * 5);
    assert.equal(caps(body, 0).length, 37);
    assert.equal(caps(body, 5).length, 37);
    assert.equal(body.faces.length, 82, "Only the eight outer walls remain");
    for (const cap of [...caps(body, 0), ...caps(body, 5)]) {
      assert.ok(cap.thickness, "Every partition retains its opposite-face guide");
      near(cap.thickness.distance, 5);
      assert.equal(cap.thickness.slope, 1);
      assert.ok(body.faces.some((face) => face.id === cap.thickness?.face));
    }
    assert.ok(exportMesh(body).triangles.length > 0);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, before);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
  } finally {
    owner.close();
  }
});

test("partial drain selection preserves openings and disconnected swept regions", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document })).error, undefined);
    const sketch = owner.view.data.sketches[0];
    const profiles = profilesFor(sketch);
    // Fill two screw holes while keeping the remaining holes and slots open.
    // Reversed order prevents the perforated face being a special first operand.
    for (const selected of [[profiles[2], profiles[1], profiles[0]], profiles.slice(1, 5)]) {
      const reply = await owner.call({
        kind: "extrude",
        extrusion: {
          sources: selected.map((profile) => ({ sketch: sketch.id, profile: profile.key })),
          distance: -3,
          symmetric: true,
          mode: "new",
        },
      });
      assert.equal(reply.error, undefined);
      const bodies = reply.view.candidate?.bodies ?? [];
      assert.equal(bodies.length, selected.length === 3 ? 1 : 4);
      near(
        bodies.reduce((sum, body) => sum + body.volume, 0),
        selected.reduce((sum, profile) => sum + profile.area, 0) * 3,
      );
      for (const body of bodies) {
        near(body.bounds[2], -1.5);
        near(body.bounds[5], 1.5);
      }
      if (selected.length === 3) {
        assert.equal(caps(bodies[0], -1.5).length, 3);
        assert.equal(caps(bodies[0], 1.5).length, 3);
      }
    }
  } finally {
    owner.close();
  }
});
