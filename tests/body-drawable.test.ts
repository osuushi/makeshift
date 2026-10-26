import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { DocumentOwner } from "../src/backend/document-owner.js";
import { BodyDrawable, sameBodyDrawing } from "../src/model/body-drawable.js";
import { inspectBodyRendering } from "../src/model/body-render-inspection.js";
import { planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { foregroundBodyLayer } from "../src/sketch/world-foreground.js";
import { prism, square } from "./body-edge-fixtures.js";

test("fresh extrusion candidates retain materials while replacing geometry and picking identities", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const counts = { created: 0, disposed: 0 };
    const drawing = new BodyDrawable(body, counts);
    const meshes = drawing.group.children.filter((object) => object instanceof THREE.Mesh);
    const materials = meshes.map((mesh) => mesh.material);
    const maskGeometry = drawing.group.userData.bodyMaskGeometry;
    let geometryDisposals = 0,
      materialDisposals = 0;
    for (const mesh of meshes) {
      mesh.geometry.addEventListener("dispose", () => geometryDisposals++);
      assert.ok(!Array.isArray(mesh.material));
      mesh.material.addEventListener("dispose", () => materialDisposals++);
    }
    const sketch = owner.view.data.sketches[0];
    const reply = await owner.call({
      kind: "extrude",
      extrusion: {
        sources: [{ sketch: sketch.id, profile: profilesFor(sketch)[0].key }],
        distance: 17,
        mode: "new",
      },
    });
    assert.equal(reply.error, undefined);
    const candidate = reply.view.candidate?.bodies?.find((next) => next.id !== body.id);
    assert.ok(candidate);
    assert.equal(drawing.reuse(candidate), true);
    assert.notEqual(drawing.group.userData.bodyMaskGeometry, maskGeometry);
    assert.equal(geometryDisposals, 6);
    assert.equal(materialDisposals, 0);
    assert.deepEqual(
      meshes.map((mesh) => mesh.material),
      materials,
    );
    for (const [i, mesh] of meshes.entries()) {
      assert.deepEqual(mesh.userData.bodyFace, { body: candidate.id, face: candidate.faces[i].id });
      mesh.geometry.computeBoundingBox();
      assert.ok(mesh.geometry.boundingBox);
      assert.ok(mesh.geometry.boundingBox.max.z <= 17);
    }
    assert.ok(meshes.some((mesh) => mesh.geometry.boundingBox?.max.z === 17));
    drawing.highlight(candidate, new Set());
    drawing.style(new Set([candidate.id]), new Set(), undefined, null);
    assert.equal(drawing.source, candidate);
    drawing.dispose();
    assert.equal(materialDisposals, 6);
    assert.equal(counts.created, counts.disposed);
  } finally {
    owner.close();
  }
});

test("drawable compatibility uses presentation values rather than IDs or exact-shape identity", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    assert.equal(sameBodyDrawing(body, structuredClone(body)), true);
    const changedTriangle = structuredClone(body);
    changedTriangle.faces[0].vertices[0] += 1;
    assert.equal(sameBodyDrawing(body, changedTriangle), false);
    const changedEdge = structuredClone(body);
    changedEdge.edges[0].points[0] += 1;
    assert.equal(sameBodyDrawing(body, changedEdge), false);
    const splitIdentity = { ...body, id: "split" };
    assert.equal(sameBodyDrawing(body, splitIdentity), false);
    const cap = body.faces.find((face) => face.plane?.origin[2] === 10);
    assert.ok(cap);
    const offset = await owner.call({
      kind: "offset-faces",
      operation: { faces: [{ body: body.id, face: cap.id }], distance: 1 },
    });
    assert.equal(offset.error, undefined);
    const candidate = offset.view.candidate?.bodies?.[0];
    assert.ok(candidate);
    assert.equal(candidate.id, body.id);
    assert.equal(sameBodyDrawing(body, candidate), false);
  } finally {
    owner.close();
  }
});

test("face styling and source-chain highlighting preserve resources and dispose them once", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square),
      counts = { created: 0, disposed: 0 };
    const drawing = new BodyDrawable(body, counts),
      scene = new THREE.Scene();
    scene.add(drawing.group);
    const original = inspectBodyRendering(scene),
      cap = body.faces.find((face) => face.plane?.origin[2] === 10);
    assert.ok(cap);
    const maskGeometry = drawing.group.userData.bodyMaskGeometry;
    assert.equal(drawing.reuse(structuredClone(body)), true);
    assert.equal(drawing.group.userData.bodyMaskGeometry, maskGeometry);
    drawing.style(new Set(), new Set([cap.id]), undefined, { ...planes.XY, origin: [0, 0, 10] });
    const styled = inspectBodyRendering(scene);
    assert.equal(styled.faces.find((face) => face.face === cap.id)?.color, "82b5e0");
    assert.equal(styled.faces.find((face) => face.face === cap.id)?.stencil, 6);
    const capMesh = drawing.group.children.find(
      (object) => object.userData.bodyFace?.face === cap.id,
    );
    assert.ok(capMesh);
    assert.equal(
      capMesh.layers.isEnabled(foregroundBodyLayer),
      false,
      "Coplanar faces cannot flicker in the complementary pass",
    );
    drawing.style(new Set(), new Set(), undefined, null);
    assert.equal(
      capMesh.layers.isEnabled(foregroundBodyLayer),
      true,
      "Clearing the cut restores ordinary foreground eligibility",
    );
    assert.deepEqual(
      styled.faces.map((face) => face.geometry),
      original.faces.map((face) => face.geometry),
    );
    const edges = new Set([body.edges[0].id]);
    drawing.highlight(body, edges);
    const highlight = drawing.group.children.find(
      (object) => object.renderOrder === 20,
    ) as THREE.Mesh;
    assert.ok(highlight);
    let disposed = 0;
    highlight.geometry.addEventListener("dispose", () => {
      disposed++;
    });
    drawing.highlight(structuredClone(body), edges);
    assert.equal(
      drawing.group.children.find((object) => object.renderOrder === 20),
      highlight,
    );
    drawing.highlight(body, new Set());
    assert.equal(disposed, 1);
    assert.deepEqual(counts, { created: 6, disposed: 0 });
    drawing.dispose();
    drawing.dispose();
    assert.deepEqual(counts, { created: 6, disposed: 6 });
    assert.equal(drawing.group.children.length, 0);
    assert.equal(disposed, 1);
  } finally {
    owner.close();
  }
});
