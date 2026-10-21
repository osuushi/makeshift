import assert from "node:assert/strict";
import test from "node:test";
import { QuarterTurn } from "../src/sketch/quarter-turn.js";

test("small twist noise cancels and a deliberate turn fires exactly once", () => {
  const gesture = new QuarterTurn(),
    degree = Math.PI / 180;
  assert.equal(gesture.update(8 * degree), 0);
  assert.equal(gesture.update(-8 * degree), 0);
  assert.equal(gesture.update(9 * degree), 0);
  assert.equal(gesture.update(1 * degree), Math.PI / 2);
  assert.equal(gesture.update(100 * degree), 0);
  assert.equal(gesture.update(-150 * degree), 0);
  gesture.reset();
  assert.equal(gesture.update(-10 * degree), -Math.PI / 2);
  assert.equal(gesture.update(Number.NaN), 0);
});

test("tablet pan/pinch tolerates angular drift before a deliberate twist in either direction", () => {
  const gesture = new QuarterTurn(Math.PI / 6),
    degree = Math.PI / 180;
  for (const direction of [1, -1]) {
    gesture.reset();
    for (const delta of [12, 8, -7, 11, -24, 29])
      assert.equal(gesture.update(direction * delta * degree), 0);
    assert.equal(gesture.update(direction * 2 * degree), (direction * Math.PI) / 2);
    assert.equal(gesture.update(direction * 90 * degree), 0);
    assert.equal(gesture.update(-direction * 180 * degree), 0);
  }
});
