import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import type { Body } from "../src/model/body.js";
import { sectionBodyHits } from "../src/model/section-picking.js";
import { planes } from "../src/sketch/planes.js";

const bodies = JSON.parse(readFileSync("tests/fixtures/section-overlap.makeshift", "utf8")).document
  .bodies as Body[];
function hits(x: number, z: number, reverse = false) {
  const camera = new THREE.Vector3(x, reverse ? 100 : -100, z);
  return sectionBodyHits(
    bodies,
    new THREE.Ray(camera, new THREE.Vector3(0, reverse ? -1 : 1, 0)),
    planes.XZ,
    camera,
  );
}

test("Section material hits include overlapping bodies on either camera side, without cavity hits", () => {
  for (const reverse of [false, true]) {
    assert.deepEqual(
      hits(15.3, 27.2, reverse).map((h) => h.body),
      bodies.slice(0, 2).map((b) => b.id),
    );
    assert.deepEqual(
      hits(15.3, 10.2, reverse).map((h) => h.body),
      [bodies[0].id],
      "The second body's cavity is not a cap",
    );
    assert.deepEqual(hits(-60, 20, reverse), []);
    assert.ok(hits(15.3, 27.2, reverse).every((hit) => hit.depth === 100));
  }
});

test("Section picking excludes missing cuts, hidden input bodies and tangent real faces", () => {
  const camera = new THREE.Vector3(0, 0, -100);
  const ray = new THREE.Ray(camera, new THREE.Vector3(0, 0, 1));
  assert.deepEqual(sectionBodyHits(bodies, ray, null, camera), []);
  assert.deepEqual(sectionBodyHits([], ray, planes.XY, camera), []);
  assert.deepEqual(
    sectionBodyHits([bodies[0]], ray, planes.XY, camera),
    [],
    "Existing bottom face owns the tangent cut",
  );
});
