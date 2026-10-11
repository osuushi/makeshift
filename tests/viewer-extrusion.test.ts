import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import type { Extrusion } from "../src/model/body.js";
import { sourceExtrusion, viewerSide } from "../src/model/viewer-extrusion.js";
import { planeNormal, planes } from "../src/sketch/planes.js";

function camera(position: number[], up = [0, 0, 1]) {
  const view = new THREE.OrthographicCamera();
  view.position.fromArray(position);
  view.up.fromArray(up);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld();
  return view;
}

test("positive plane extrusion faces the viewer on either side of every canonical plane", () => {
  for (const plane of Object.values(planes)) {
    const normal = planeNormal(plane);
    for (const side of [-1, 1]) {
      const position = normal.map((value, i) => value * side * 100 + (i === 0 ? 0.3 : 0.7));
      assert.equal(viewerSide(normal, camera(position)), side);
      assert.equal(viewerSide(normal, camera(position, [0, 0, -1])), side);
    }
  }
});

test("edge-on extrusion uses the user's screen up, including a rolled view", () => {
  assert.equal(viewerSide([0, 0, 1], camera([0, -10, 0])), 1);
  assert.equal(viewerSide([0, 0, 1], camera([0, -10, 0], [0, 0, -1])), -1);
});

test("viewer/source conversion preserves draft, symmetry, source frames and reopen geometry", () => {
  const input: Extrusion = {
    sources: [{ sketch: "sketch", profile: "region" }],
    distance: 12,
    twist: { angle: 30, origin: [3, 4, 0] },
    draft: { mode: "offset", value: -2 },
    symmetric: true,
    mode: "new",
  };
  const original = structuredClone(input);
  const converted = sourceExtrusion(input, -1);
  assert.equal(converted.distance, -12);
  assert.equal(converted.twist?.angle, -30);
  assert.deepEqual(converted.draft, input.draft);
  assert.equal(converted.symmetric, true);
  assert.deepEqual(sourceExtrusion(converted, -1), input);
  assert.deepEqual(sourceExtrusion(input, 1), input);
  assert.deepEqual(input, original);
});
