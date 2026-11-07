import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { movementNormal } from "../src/model/transform-plane.js";
import {
  alignedAxis,
  arrowWidthAxis,
  boundaryNormalVisible,
  rotationVisible,
  uprightAxis,
} from "../src/sketch/move-widget/geometry.js";

function camera(position: number[], up = [0, 0, 1]) {
  const result = new THREE.OrthographicCamera();
  result.position.fromArray(position);
  result.up.fromArray(up);
  result.lookAt(0, 0, 0);
  result.updateMatrixWorld();
  return result;
}

test("Boundary Move hides redundant world-axis normals and retains distinct tilted directions", () => {
  assert.equal(boundaryNormalVisible(null), false);
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const normal: [number, number, number] = [0, 0, 0];
      normal[axis] = sign;
      assert.equal(boundaryNormalVisible(normal), false);
      // Kernel/transformed normals can contain insignificant off-axis components.
      normal[(axis + 1) % 3] = 1e-8;
      assert.equal(boundaryNormalVisible(normal), false);
      const angle = Math.PI / 180;
      normal[axis] = sign * Math.cos(angle);
      normal[(axis + 1) % 3] = Math.sin(angle);
      assert.equal(boundaryNormalVisible(normal), true);
    }
  assert.equal(boundaryNormalVisible([0, -Math.sin(0.6), Math.cos(0.6)]), true);
});

test("Move suppresses an end-on axis on either camera side, with a bounded 12 degree tolerance", () => {
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const p = [0, 0, 0];
      p[axis] = sign;
      assert.equal(alignedAxis(camera(p, axis === 2 ? [0, 1, 0] : [0, 0, 1])), axis);
    }
  assert.equal(
    alignedAxis(
      camera([Math.sin((11 * Math.PI) / 180), 0, Math.cos((11 * Math.PI) / 180)], [0, 1, 0]),
    ),
    2,
  );
  assert.equal(
    alignedAxis(
      camera([Math.sin((13 * Math.PI) / 180), 0, Math.cos((13 * Math.PI) / 180)], [0, 1, 0]),
    ),
    null,
  );
  assert.equal(alignedAxis(camera([1, 1, 1])), null);
});

test("Near-tie fallback identifies the upright canonical axis, including inverted Y-up", () => {
  assert.deepEqual(uprightAxis(camera([4, 3, 5], [0, 1, 0])), [0, 1, 0]);
  assert.deepEqual(uprightAxis(camera([4, 3, 5], [0, -1, 0])), [0, 1, 0]);
  assert.deepEqual(uprightAxis(camera([4, -5, 3])), [0, 0, 1]);
});

test("Planar movement chooses the largest projected square on either camera side", () => {
  for (const sign of [-1, 1]) {
    for (const [position, normal] of [
      [
        [4, 3, 2],
        [1, 0, 0],
      ],
      [
        [2, 4, 3],
        [0, 1, 0],
      ],
      [
        [3, 2, 4],
        [0, 0, 1],
      ],
    ]) {
      assert.deepEqual(movementNormal(camera(position.map((v) => sign * v))).toArray(), normal);
    }
  }
  assert.deepEqual(movementNormal(camera([4, 3, 5], [0, 1, 0])).toArray(), [0, 0, 1]);
});

test("Only close area matches fall back to the upright plane", () => {
  assert.deepEqual(movementNormal(camera([1, 1, 1])).toArray(), [0, 0, 1]);
  assert.deepEqual(movementNormal(camera([1, 0.96, 0.5])).toArray(), [0, 0, 1]);
  assert.deepEqual(movementNormal(camera([1, 0.94, 0.5])).toArray(), [1, 0, 0]);
  assert.deepEqual(movementNormal(camera([1, 0.5, 0.96], [0, -1, 0])).toArray(), [0, 1, 0]);
});

test("rotation markers hide edge-on on either side; reference widths remain perpendicular", () => {
  assert.equal(rotationVisible(camera([1, 0, 0]), [0, 0, 1]), false);
  assert.equal(rotationVisible(camera([0, 0, 1]), [0, 0, 1]), true);
  assert.equal(rotationVisible(camera([0, 0, -1]), [0, 0, 1]), true);
  assert.equal(rotationVisible(camera([1, 0, 0.1]), [0, 0, 1]), false);
  assert.equal(rotationVisible(camera([1, 0, 0.3]), [0, 0, 1]), true);
  assert.deepEqual(arrowWidthAxis([1, 0, 0]), [0, 1, 0]);
  assert.deepEqual(arrowWidthAxis([0, 1, 0]), [1, 0, 0]);
  assert.deepEqual(arrowWidthAxis([0, 0, 1]), [1, 0, 0]);
});
