import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { faceBoundaryEdges } from "../src/model/face-boundary.js";
import { featureEdges } from "../src/model/feature-edges.js";
import { emptySketch } from "../src/sketch/document.js";
import type { ModelingTarget } from "../src/sketch/model-selection-state.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";

test("BRep face boundaries retain hole loops, exclude shared edges/seams, and survive archive regeneration", async () => {
  const owner = new DocumentOwner();
  try {
    await createRing(owner);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const targets = (faces: typeof body.faces): ModelingTarget[] =>
      faces.map((f) => ({ kind: "face", body: body.id, face: f.id }));
    const planar = body.faces.filter((f) => f.plane);
    const walls = body.faces.filter((f) => !f.plane);
    assert.equal(planar.length, 2);
    assert.equal(walls.length, 2);
    assertWallNormals(walls);
    assert.equal(featureEdges(body).length, 4);
    const top = planar.find((f) => f.plane?.origin[2] === 5);
    assert.ok(top);
    const boundary = faceBoundaryEdges([body], targets([top]));
    assert.equal(boundary.length, 2, "One edge per circular loop");
    const radii = boundary
      .map((t) => {
        const edge = body.edges.find((e) => t.kind === "edge" && e.id === t.edge);
        assert.ok(edge);
        return Math.round(Math.hypot(edge.points[0], edge.points[1]));
      })
      .sort((a, b) => a - b);
    assert.deepEqual(radii, [3, 10], "Outer and hole loops both survive");
    const innerWalls = walls.filter((f) => f.signature[2] < 100);
    assert.equal(innerWalls.length, 1);
    assert.equal(
      faceBoundaryEdges([body], targets([top, ...innerWalls])).length,
      2,
      "Shared cap/wall edges are internal",
    );
    assert.equal(
      faceBoundaryEdges([body], targets(planar)).length,
      4,
      "Disjoint faces keep separate loops",
    );
    assert.equal(
      faceBoundaryEdges([body], targets(body.faces)).length,
      0,
      "Closed shell has no boundary",
    );
    assert.equal(
      faceBoundaryEdges([body], [...targets([top]), { kind: "body", body: body.id }]).length,
      0,
    );
    assert.equal(owner.view.candidate, null);
    const original = owner.view.data;
    // Older archives have no face-edge presentation data; exact BRep recreates it.
    const archive = JSON.parse(JSON.stringify(original));
    for (const face of archive.bodies[0].faces) delete face.edges;
    assert.equal((await owner.call({ kind: "open", document: archive })).error, undefined);
    const reopened = owner.view.data.bodies?.[0];
    assert.ok(reopened);
    assert.deepEqual(
      reopened.faces.map((f) => f.edges),
      body.faces.map((f) => f.edges),
    );
    // Repeated geometry in a second body remains separately addressable.
    await owner.call({
      kind: "transform-bodies",
      transform: {
        ids: [body.id],
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angle: 0,
        translation: [30, 0, 0],
        duplicate: true,
      },
    });
    const bodies = owner.view.data.bodies as Body[];
    const faces = bodies.map((b) => ({
      kind: "face" as const,
      body: b.id,
      face: b.faces.find((f) => f.plane?.origin[2] === 5)?.id as string,
    }));
    const edges = faceBoundaryEdges(bodies, faces);
    assert.equal(edges.length, 4);
    assert.equal(new Set(edges.map((t) => t.kind === "edge" && t.edge)).size, 4);
  } finally {
    owner.close();
  }
});

async function createRing(owner: DocumentOwner) {
  const sketch = {
    ...emptySketch(planes.XY),
    curves: [10, 3].map((radius, i) => ({
      id: `circle${i}`,
      kind: "circle" as const,
      center: { x: 0, y: 0 },
      radius,
      construction: false,
    })),
  };
  await owner.call({ kind: "edit", sketch });
  const ring = profilesFor(sketch).find((p) => p.holes.length === 1);
  assert.ok(ring);
  assert.equal(
    (
      await owner.call({
        kind: "extrude",
        extrusion: {
          sources: [{ sketch: sketch.id, profile: ring.key }],
          distance: 5,
          mode: "new",
        },
      })
    ).error,
    undefined,
  );
  await owner.call({ kind: "accept" });
}

test("native periodic cylinder seam appears twice and is excluded from the face boundary", async () => {
  const owner = new DocumentOwner();
  try {
    const fixture = JSON.parse(readFileSync("tests/fixtures/periodic-cylinder.json", "utf8"));
    const reply = await owner.call({
      kind: "open",
      document: { units: "mm", sketches: [], bodies: [fixture] },
    });
    assert.equal(reply.error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const wall = body.faces.find((f) => !f.plane);
    assert.ok(wall);
    assert.equal(featureEdges(body).length, 2);
    assert.equal(wall.edges.length, 4);
    assert.equal(new Set(wall.edges).size, 3);
    const boundary = faceBoundaryEdges([body], [{ kind: "face", body: body.id, face: wall.id }]);
    assert.equal(boundary.length, 2);
    assert.ok(
      boundary.every(
        (t) =>
          body.edges.find((e) => t.kind === "edge" && e.id === t.edge)?.curve?.kind === "circle",
      ),
    );
  } finally {
    owner.close();
  }
});

function assertWallNormals(walls: Body["faces"]): void {
  for (const face of walls) {
    assert.ok(face.cylinder);
    const normals = face.normals;
    assert.ok(normals);
    assert.equal(normals.length, face.vertices.length);
    for (let i = 0; i < face.vertices.length; i += 3) {
      const radius = Math.hypot(face.vertices[i], face.vertices[i + 1]);
      const orientation = radius < 5 ? -1 : 1;
      assert.ok(Math.abs(normals[i] - (orientation * face.vertices[i]) / radius) < 1e-5);
      assert.ok(Math.abs(normals[i + 1] - (orientation * face.vertices[i + 1]) / radius) < 1e-5);
      assert.ok(Math.abs(normals[i + 2]) < 1e-5);
    }
  }
}
