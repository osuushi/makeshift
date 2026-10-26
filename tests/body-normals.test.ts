import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { meshNormals } from "../src/backend/kernel-values.js";
import type { Body } from "../src/model/body.js";
import { BodyDrawable, sameBodyDrawing } from "../src/model/body-drawable.js";
import { faceGeometry } from "../src/model/body-mesh.js";
import { placedBodies } from "../src/model/body-placement.js";

const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0];
const normals = [1, 0, 0, 0, 1, 0, 0, 0, 1];

test("renderer retains supplied surface directions and supports legacy triangles", () => {
  const exact = faceGeometry(vertices, normals);
  const legacy = faceGeometry(vertices);
  try {
    assert.deepEqual(Array.from(exact.getAttribute("normal").array), normals);
    assert.deepEqual(Array.from(legacy.getAttribute("normal").array), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
  } finally {
    exact.dispose();
    legacy.dispose();
  }
});

test("display rotation rotates normals without translating them and invalidates cached shading", () => {
  const body: Body = {
    id: "body",
    brep: "unused by display placement",
    volume: 1,
    bounds: [0, 0, 0, 1, 1, 0],
    center: [0, 0, 0],
    edges: [],
    faces: [
      { id: "face", signature: [0, 0, 0, 0, 0, 0], edges: [], plane: null, vertices, normals },
    ],
  };
  const placed = placedBodies([body], {
    ids: [body.id],
    pivot: [2, 3, 4],
    axis: [0, 0, 1],
    angle: 90,
    translation: [10, 20, 30],
    duplicate: false,
  })[0];
  const expected = [0, 1, 0, -1, 0, 0, 0, 0, 1];
  assert.ok(placed.faces[0].normals?.every((v, i) => Math.abs(v - expected[i]) < 1e-7));
  assert.equal(
    sameBodyDrawing(body, { ...body, faces: [{ ...body.faces[0], normals: expected }] }),
    false,
  );
  const reused = new BodyDrawable(body, { created: 0, disposed: 0 });
  const fresh = new BodyDrawable(placed, { created: 0, disposed: 0 });
  try {
    assert.equal(reused.reuse(placed), true);
    const updatedMesh = reused.group.children[0];
    const freshMesh = fresh.group.children[0];
    assert.ok(updatedMesh instanceof THREE.Mesh && freshMesh instanceof THREE.Mesh);
    assert.deepEqual(
      Array.from(updatedMesh.geometry.getAttribute("normal").array),
      Array.from(freshMesh.geometry.getAttribute("normal").array),
      "Updating an existing drawable must shade identically to recreating it after paste",
    );
  } finally {
    reused.dispose();
    fresh.dispose();
  }
});

test("kernel rejects malformed normals rather than passing corrupt shading to WebGL", () => {
  meshNormals(undefined, 9);
  meshNormals(normals, 9);
  assert.throws(() => meshNormals([0, 0, 1], 9));
  assert.throws(() => meshNormals([0, 0, 0], 3));
  assert.throws(() => meshNormals([Number.NaN, 0, 1], 3));
});
