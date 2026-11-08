import assert from "node:assert/strict";
import test from "node:test";
import { type PlaneFrame, planeNormal, planes, worldPoint } from "../src/sketch/planes.js";
import { regionGridCoordinates } from "../src/sketch/region-material.js";

test("Region hexes keep their pixel size through zoom and align to the projected world origin", () => {
  const xy = regionGridCoordinates(planes.XY, 0.125);
  const offset = regionGridCoordinates({ ...planes.XY, origin: [4, 7, 9] }, 0.125);
  assert.deepEqual(xy([0, 0, 0]), [0, 0]);
  assert.deepEqual(xy([1.625, 3.25, 0]), [1, 2]);
  assert.deepEqual(offset([1.625, 3.25, 9]), [1, 2]);
  const zoomed = regionGridCoordinates(planes.XY, 0.0625);
  assert.deepEqual(zoomed([0, 0, 0]), [0, 0]);
  assert.deepEqual(zoomed([0.8125, 1.625, 0]), [1, 2]);
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
  const original = regionGridCoordinates(plane, 0.125)(worldPoint(plane, { x: 5, y: 11 }));
  const shifted = regionGridCoordinates(reversed, 0.125)(worldPoint(reversed, { x: 11, y: 5 }));
  for (const [axis, coordinate] of original.entries())
    assert.ok(Math.abs(coordinate - shifted[axis]) < 1e-12);
});
