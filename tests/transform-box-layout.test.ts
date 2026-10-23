import assert from "node:assert/strict";
import test from "node:test";
import { boxHandles, type TransformBox } from "../src/model/transform-box.js";
import {
  boxHandleVisible,
  outsideBoxRatio,
  projectedHull,
} from "../src/model/transform-box-layout.js";
import type { Vector } from "../src/sketch/planes.js";

const box: TransformBox = { min: [-10, -20, -30], max: [10, 20, 30], frame: null };

test("opaque box hides only handles whose incident faces all face away", () => {
  const handles = boxHandles(box);
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const view: Vector = [x, y, z];
        for (const handle of handles) {
          const signs = handle.key.split(",").map(Number);
          assert.equal(
            boxHandleVisible(box, handle, view),
            signs.some((sign, axis) => sign * view[axis] > 0),
          );
        }
      }
});

test("axis-aligned views hide back and edge-on face controls", () => {
  for (const axis of [0, 1, 2])
    for (const sign of [-1, 1]) {
      const view: Vector = [0, 0, 0];
      view[axis] = sign;
      const visible = boxHandles(box).filter((handle) => boxHandleVisible(box, handle, view));
      assert.equal(visible.length, 9);
      assert.ok(
        visible.every(
          (handle) => handle.point[axis] === (sign < 0 ? box.min[axis] : box.max[axis]),
        ),
      );
    }
});

test("zero-thickness boxes remain accessible from both sides", () => {
  for (const axis of [0, 1, 2]) {
    const planar = { ...box, max: [...box.max] as Vector };
    planar.max[axis] = planar.min[axis];
    for (const handle of boxHandles(planar))
      for (const view of [
        [1, 1, 1],
        [-1, -1, -1],
      ] as Vector[])
        assert.ok(boxHandleVisible(planar, handle, view));
  }
});

test("move and rotation rays clear the entire box silhouette plus hit radius", () => {
  const hull = projectedHull([
    { x: -200, y: -100 },
    { x: 200, y: -100 },
    { x: 200, y: 100 },
    { x: -200, y: 100 },
    { x: 0, y: 0 },
  ]);
  assert.equal(hull.length, 4);
  assert.ok(outsideBoxRatio({ x: 96, y: 0 }, hull, 32) > 232 / 96);
  const rotation = outsideBoxRatio({ x: 60, y: 60 }, hull, 32);
  assert.ok(rotation > 132 / 60);
  assert.equal(outsideBoxRatio({ x: 300, y: 0 }, hull, 32), 1);
  assert.equal(outsideBoxRatio({ x: 0, y: 0 }, hull, 32), 1);
});

test("clearance follows a rotated silhouette without using its larger axis-aligned box", () => {
  const hull = projectedHull([
    { x: 0, y: -100 },
    { x: 100, y: 0 },
    { x: 0, y: 100 },
    { x: -100, y: 0 },
  ]);
  assert.equal(outsideBoxRatio({ x: 80, y: 80 }, hull, 10), 1);
  assert.ok(outsideBoxRatio({ x: 20, y: 20 }, hull, 10) > 2.5);
});
