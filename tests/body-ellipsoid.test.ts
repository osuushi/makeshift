import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { bodyEllipsoid, projectBodyEllipsoid } from "../src/sketch/body-ellipsoid.js";
import { BodyXrayMask } from "../src/sketch/body-xray-mask.js";
import type { World } from "../src/sketch/world.js";

const vertices = (geometry: THREE.BufferGeometry) => [
  Array.from(geometry.getAttribute("position").array),
];

test("oriented fit contains rotated elongated triangles and stays tight on a smooth ellipsoid", () => {
  const sphere = new THREE.SphereGeometry(1, 64, 32);
  const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.4, 0.7, 0.3));
  sphere.scale(9, 2, 0.5).applyMatrix4(rotation).translate(100, -200, 300);
  const source = vertices(sphere),
    fit = bodyEllipsoid(source);
  assert.ok(fit);
  assert.ok(fit.center.distanceTo(new THREE.Vector3(100, -200, 300)) < 0.02);
  const lengths = fit.axes.map((axis) => axis.length()).sort((a, b) => a - b);
  for (const [i, expected] of [0.5, 2, 9].entries())
    assert.ok(Math.abs(lengths[i] / expected - 1) < 0.02);
  for (let i = 0; i < source[0].length; i += 3) {
    const p = new THREE.Vector3().fromArray(source[0], i).sub(fit.center);
    const squared = fit.axes.reduce((sum, axis) => sum + (p.dot(axis) / axis.lengthSq()) ** 2, 0);
    assert.ok(squared <= 1 + 1e-8, String(squared));
  }
  assert.equal(bodyEllipsoid(source), fit);
  assert.notEqual(bodyEllipsoid(structuredClone(source)), fit);
  sphere.dispose();
});

test("empty, point, flat and box fits remain finite and contain their vertices", () => {
  assert.equal(bodyEllipsoid([]), null);
  const box = new THREE.BoxGeometry(2, 4, 6);
  for (const source of [[[1, 2, 3]], [[-2, -1, 0, 2, -1, 0, 2, 1, 0, -2, 1, 0]], vertices(box)]) {
    const fit = bodyEllipsoid(source);
    assert.ok(fit);
    assert.ok(fit.axes.every((axis) => Number.isFinite(axis.length()) && axis.length() > 0));
    for (const face of source)
      for (let i = 0; i < face.length; i += 3) {
        const p = new THREE.Vector3().fromArray(face, i).sub(fit.center);
        assert.ok(
          fit.axes.reduce((sum, axis) => sum + (p.dot(axis) / axis.lengthSq()) ** 2, 0) <= 1.00001,
        );
      }
  }
  box.dispose();
});

test("projected shape matrix contains the full ellipsoid through camera and body transforms", () => {
  const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 100);
  camera.position.set(5, 8, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const fit = {
    center: new THREE.Vector3(1, 2, 3),
    axes: [new THREE.Vector3(8, 0, 0), new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, 1)],
  };
  const transform = new THREE.Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .multiply(new THREE.Matrix4().makeRotationZ(0.7));
  const ellipse = projectBodyEllipsoid(fit, transform, 1200, 800);
  let max = 0;
  for (let i = 0; i < 2000; i++) {
    const z = (2 * (i + 0.5)) / 2000 - 1,
      angle = i * 2.399963229728653;
    const r = Math.sqrt(1 - z * z);
    const p = fit.center
      .clone()
      .addScaledVector(fit.axes[0], r * Math.cos(angle))
      .addScaledVector(fit.axes[1], r * Math.sin(angle))
      .addScaledVector(fit.axes[2], z)
      .applyMatrix4(transform);
    const x = (p.x + 1) * 600 - ellipse.center.x,
      y = (p.y + 1) * 400 - ellipse.center.y;
    const u = x * ellipse.direction.x + y * ellipse.direction.y;
    const v = -x * ellipse.direction.y + y * ellipse.direction.x;
    const squared = (u / ellipse.radii.x) ** 2 + (v / ellipse.radii.y) ** 2;
    assert.ok(squared <= 1.000001);
    max = Math.max(max, squared);
  }
  assert.ok(max > 0.999);
});

test("mask invalidates projection on camera/geometry/visibility changes without refitting unchanged vertices", () => {
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera();
  const body = new THREE.Group();
  const source = [[-1, -1, 0, 1, 1, 0]];
  body.userData.bodyMaskGeometry = source;
  scene.add(body);
  const world = {
    scene,
    camera,
    canvas: { clientWidth: 100, clientHeight: 100 },
  } as unknown as World;
  const mask = new BodyXrayMask();
  const first = mask.read(world),
    fit = bodyEllipsoid(source);
  assert.equal(mask.read(world), first);
  camera.position.x++;
  camera.updateMatrixWorld();
  assert.notEqual(mask.read(world), first);
  assert.equal(bodyEllipsoid(source), fit);
  const moved = mask.read(world);
  body.userData.bodyMaskGeometry = [[-2, -1, 0, 2, 1, 0]];
  assert.notEqual(mask.read(world), moved);
  const changed = mask.read(world);
  body.visible = false;
  assert.notEqual(mask.read(world), changed);
  mask.dispose();
});
