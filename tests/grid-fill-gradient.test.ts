import assert from "node:assert/strict";
import test from "node:test";
import { gridFillGradient } from "../src/sketch/grid-fill-gradient.js";

test("grid fill is clear at center and reaches full strength at the nearest viewport edge", () => {
  assert.equal(gridFillGradient(400, 200, 800, 400), 0);
  assert.equal(gridFillGradient(400, 0, 800, 400), 1);
  assert.equal(gridFillGradient(0, 0, 800, 400), 1);
  assert.equal(gridFillGradient(500, 200, 800, 400), 0.5);
});

test("grid fill stays circular on wide screens and independent of pixel density", () => {
  assert.equal(gridFillGradient(500, 200, 800, 400), gridFillGradient(400, 300, 800, 400));
  assert.equal(gridFillGradient(500, 200, 800, 400), gridFillGradient(1000, 400, 1600, 800));
});
