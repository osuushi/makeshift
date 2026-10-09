import assert from "node:assert/strict";
import test from "node:test";
import type { BodyGeometry } from "../src/model/body.js";
import { drillDepth } from "../src/model/drill-depth.js";
import type { PlaneFrame } from "../src/sketch/planes.js";

const body: BodyGeometry = {
  id: "body",
  volume: 6000,
  center: [0, 0, 15],
  bounds: [-10, -5, 0, 10, 5, 30],
  faces: [],
  edges: [],
};

test("drill clears the whole selected body from either face", () => {
  const top: PlaneFrame = { origin: [0, 0, 30], u: [1, 0, 0], v: [0, 1, 0] };
  const bottom: PlaneFrame = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, -1, 0] };
  for (const plane of [top, bottom]) {
    assert.ok(drillDepth(body, plane) > 30);
    assert.ok(drillDepth(body, plane) < 30.001);
  }
});

test("oblique drilling conservatively clears all exact-bound corners", () => {
  const s = Math.SQRT1_2;
  const plane: PlaneFrame = { origin: [10, 0, 30], u: [0, 1, 0], v: [-s, 0, s] };
  assert.ok(Math.abs(drillDepth(body, plane) - 50 * s) < 0.001);
});
