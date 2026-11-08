import assert from "node:assert/strict";
import test from "node:test";
import { type PlaneFrame, planeNormal, planes, worldPoint } from "../src/sketch/planes.js";
import { regionGridCoordinates } from "../src/sketch/region-material.js";

test("Region hex coordinates use a fixed scale and the projected world origin", () => {
  const xy = regionGridCoordinates(planes.XY);
  const offset = regionGridCoordinates({ ...planes.XY, origin: [4, 7, 9] });
  assert.deepEqual(xy([0, 0, 0]), [0, 0]);
  assert.deepEqual(xy([1.25, 2.5, 0]), [1, 2]);
  assert.deepEqual(offset([1.25, 2.5, 9]), [1, 2]);
});

test("Rotated and reversed frames share the same lattice for an oblique direction", () => {
  const s = Math.SQRT1_2;
  const plane: PlaneFrame = { origin: [0, 0, 0], u: [s, -s, 0], v: [0, 0, 1] };
  const [x, y, z] = planeNormal(plane);
  const reversed: PlaneFrame = {
    origin: [3 * x, 3 * y, 3 * z],
    u: plane.v,
    v: plane.u,
  };
  const original = regionGridCoordinates(plane)(worldPoint(plane, { x: 5, y: 11 }));
  const shifted = regionGridCoordinates(reversed)(worldPoint(reversed, { x: 11, y: 5 }));
  for (const [axis, coordinate] of original.entries())
    assert.ok(Math.abs(coordinate - shifted[axis]) < 1e-12);
});
