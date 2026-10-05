import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { cubeAlignment } from "../src/sketch/orientation-cube-alignment.js";
import { cubeSurfaces } from "../src/sketch/orientation-cube-geometry.js";

test("beveled cube is closed with planar surfaces for all 26 canonical directions", () => {
  const surfaces = cubeSurfaces();
  assert.equal(surfaces.filter((s) => s.kind === "face").length, 6);
  assert.equal(surfaces.filter((s) => s.kind === "edge").length, 12);
  assert.equal(surfaces.filter((s) => s.kind === "corner").length, 8);
  const edges = new Map<string, number>();
  const directions = new Set<string>();
  for (const surface of surfaces) {
    assert.ok(Math.abs(surface.normal.length() - 1) < 1e-12);
    assert.ok(surface.up.clone().cross(surface.normal).length() > 0.5);
    const plane = surface.vertices[0].dot(surface.normal);
    assert.ok(plane > 0);
    directions.add(
      surface.normal
        .toArray()
        .map((v) => Math.sign(v))
        .join(","),
    );
    surface.vertices.forEach((v, i) => {
      assert.ok(Math.abs(v.dot(surface.normal) - plane) < 1e-12);
      const next = surface.vertices[(i + 1) % surface.vertices.length];
      const key = [v.toArray().join(","), next.toArray().join(",")].sort().join(";");
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
  }
  assert.equal(directions.size, 26);
  assert.equal(edges.size, 48);
  for (const count of edges.values()) assert.equal(count, 2, "Each edge joins two surfaces");
});

test("sideways Top preserves nearest roll on single clicks and resets on double click", () => {
  const top = cubeSurfaces().find((s) => s.name === "Top");
  assert.ok(top);
  const current = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().lookAt(
      new THREE.Vector3(0, 0.5, Math.sqrt(0.75)),
      new THREE.Vector3(),
      new THREE.Vector3(1, 0, 0),
    ),
  );
  const first = cubeAlignment(top, current);
  assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(first).distanceTo(top.normal) < 1e-12);
  assert.ok(
    new THREE.Vector3(0, 1, 0).applyQuaternion(first).distanceTo(new THREE.Vector3(1, 0, 0)) <
      1e-12,
  );
  assert.ok(cubeAlignment(top, first).angleTo(first) < 1e-7);
  const second = cubeAlignment(top, first, true);
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(second).distanceTo(top.up) < 1e-12);
});

test("each face preserves its nearest quarter-turn on approach", () => {
  for (const face of cubeSurfaces().filter((s) => s.kind === "face")) {
    const canonical = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(face.normal, new THREE.Vector3(), face.up),
    );
    for (let turn = 0; turn < 4; turn++) {
      const aligned = canonical
        .clone()
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (turn * Math.PI) / 2),
        );
      const tilted = aligned
        .clone()
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3));
      assert.ok(cubeAlignment(face, tilted).angleTo(aligned) < 1e-7);
      assert.ok(cubeAlignment(face, aligned).angleTo(aligned) < 1e-7);
      assert.ok(cubeAlignment(face, tilted, true).angleTo(canonical) < 1e-7);
      assert.ok(cubeAlignment(face, aligned, true).angleTo(canonical) < 1e-7);
    }
  }
});

test("bevels have wider target spans while faces retain readable normal-scale space", () => {
  for (const surface of cubeSurfaces()) {
    const lengths = surface.vertices.map(
      (v, i) => v.distanceTo(surface.vertices[(i + 1) % surface.vertices.length]) * 38,
    );
    if (surface.kind === "face") assert.ok(Math.min(...lengths) >= 44);
    if (surface.kind === "edge") assert.ok(Math.min(...lengths) >= 22);
    if (surface.kind === "corner") {
      const [a, b, c] = surface.vertices;
      const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
      assert.ok(area >= 0.15, "Corner triangles are larger than the previous 0.089 square units");
    }
  }
});
