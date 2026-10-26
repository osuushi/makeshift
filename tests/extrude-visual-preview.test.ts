import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { validateVisualReply } from "../src/backend/kernel-visual-validation.js";
import { featureEdges } from "../src/model/feature-edges.js";
import { VisualBodyDrawable } from "../src/model/visual-preview-view.js";
import type { SketchDocument } from "../src/sketch/document.js";
import { profilesFor } from "../src/sketch/profiles.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/extrude-connected-drain.json", "utf8")) as {
  document: SketchDocument;
};

test("captured perforated extrusion draws complete mesh before editing metadata, never accepts visual data", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = structuredClone(owner.view.data);
    const sketch = original.sketches[0],
      profile = profilesFor(sketch)[0];
    const extrusion = {
      sources: [{ sketch: sketch.id, profile: profile.key }],
      distance: 5,
      mode: "new" as const,
    };
    const first = await owner.call({ kind: "extrude", extrusion });
    assert.equal(first.error, undefined);
    const complete = first.view.candidate?.bodies?.[0];
    assert.ok(complete);
    const drawn = await owner.call({ kind: "extrude", extrusion, presentation: "visual" });
    assert.equal(drawn.error, undefined);
    const visual = drawn.view.visualPreview?.bodies[0];
    assert.ok(visual);
    assert.equal(
      drawn.view.candidate,
      null,
      "A prior complete candidate cannot survive a visual target",
    );
    assert.deepEqual(drawn.view.data, original);
    assert.deepEqual(
      visual.faces,
      complete.faces.map((face) => face.vertices),
    );
    assert.deepEqual(
      visual.normals,
      complete.faces.map((face) => face.normals),
    );
    assert.deepEqual(
      visual.edges,
      featureEdges(complete)
        .filter((edge) => edge.points.length >= 6)
        .map((edge) => edge.points),
    );
    assert.deepEqual(visual.bounds, complete.bounds);
    assert.deepEqual(
      visual.planes,
      complete.faces.map((face) => face.plane),
    );
    assert.equal(visual.faces.length, 142, "Every perforated face retains its triangles");
    assert.ok(
      (await owner.call({ kind: "accept" })).error,
      "Visual-only replies cannot be accepted",
    );
    checkDrawable(visual);
    const latest = await owner.call({
      kind: "extrude",
      extrusion: { ...extrusion, distance: 7 },
      presentation: "visual",
    });
    assert.equal(latest.error, undefined);
    assert.equal(latest.view.visualPreview?.bodies[0].bounds[5], 7);
    const finished = await owner.call({
      kind: "extrude",
      extrusion: { ...extrusion, distance: 7 },
    });
    assert.equal(finished.error, undefined);
    assert.equal(finished.view.visualPreview, undefined);
    const body = finished.view.candidate?.bodies?.[0];
    assert.ok(body?.brep && body.faces.some((face) => face.thickness));
    assert.equal(body.faces.length, 142);
    assert.equal(body.edges.length, 420);
    assert.equal((await owner.call({ kind: "accept" })).error, undefined);
    assert.deepEqual(owner.view.data.bodies?.[0], body);
    assert.deepEqual((await owner.call({ kind: "undo" })).view.data, original);
    assert.equal(
      (await owner.call({ kind: "extrude", extrusion, presentation: "visual" })).error,
      undefined,
    );
    const cancelled = await owner.call({ kind: "cancel-preview" });
    assert.equal(cancelled.view.visualPreview, undefined);
    assert.equal(cancelled.view.candidate, null);
    assert.deepEqual(cancelled.view.data, original);
    await checkVariants(owner, extrusion, original);
  } finally {
    owner.close();
  }
});

async function checkVariants(
  owner: DocumentOwner,
  extrusion: import("../src/model/body.js").Extrusion,
  original: SketchDocument,
): Promise<void> {
  for (const options of [
    { distance: -7, symmetric: false },
    { distance: 5, symmetric: true },
  ]) {
    const input = { ...extrusion, ...options, mode: "auto" as const };
    const light = await owner.call({ kind: "extrude", extrusion: input, presentation: "visual" });
    const full = await owner.call({ kind: "extrude", extrusion: input });
    assert.equal(light.error, undefined);
    assert.equal(full.error, undefined);
    assert.deepEqual(
      light.view.visualPreview?.bodies[0].faces,
      full.view.candidate?.bodies?.[0].faces.map((face) => face.vertices),
    );
  }
  const unsupported = await owner.call({
    kind: "extrude",
    extrusion: { ...extrusion, draft: { mode: "angle", value: 5 } },
    presentation: "visual",
  });
  assert.ok(unsupported.error);
  assert.equal(unsupported.view.visualPreview, undefined);
  assert.equal(unsupported.view.candidate, null);
  assert.deepEqual(unsupported.view.data, original);
}

function checkDrawable(visual: import("../src/model/visual-preview.js").VisualBody): void {
  const drawing = new VisualBodyDrawable();
  drawing.update(visual);
  const [mesh, lines] = drawing.group.children.filter((object) => object.visible);
  assert.ok(mesh instanceof THREE.Mesh && lines instanceof THREE.LineSegments);
  assert.equal(drawing.group.children.filter((object) => object.visible).length, 2);
  assert.equal(
    mesh.geometry.index?.count,
    visual.faces.reduce((n, face) => n + face.length / 3, 0),
  );
  assert.equal(mesh.userData.bodyFace, undefined, "Display slots are not editable topology IDs");
  const material = mesh.material,
    before = mesh.geometry;
  let disposed = 0;
  before.addEventListener("dispose", () => disposed++);
  drawing.update(structuredClone(visual));
  assert.equal(mesh.material, material);
  assert.equal(disposed, 1);
  drawing.dispose();
}

test("visual reply validation rejects missing faces, malformed triangles and exact-body masquerades", () => {
  const reply = {
    presentation: "visual",
    mode: "new",
    participants: [],
    tools: [],
    results: [
      {
        bounds: [0, 0, 0, 1, 1, 1],
        faces: [[0, 0, 0, 1, 0, 0, 0, 1, 0]],
        planes: [null],
        edges: [],
      },
    ],
  };
  validateVisualReply(reply);
  for (const body of [
    { ...reply.results[0], faces: [] },
    { ...reply.results[0], faces: [[0, 0, 0]] },
    { ...reply.results[0], brep: "00" },
  ])
    assert.throws(() => validateVisualReply({ ...reply, results: [body] }));
});
