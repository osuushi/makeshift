import assert from "node:assert/strict";
import test from "node:test";
import { placeBooleanRole } from "../src/model/boolean-role-placement.js";

const viewport = { width: 800, height: 600 };
const own = { left: 200, right: 400, top: 200, bottom: 400 };
test("role placement keeps an unobstructed bounding-box center", () => {
  assert.deepEqual(placeBooleanRole(own, [], [], viewport), { x: 300, y: 300 });
});
test("role placement clears another selected body before minimizing distance", () => {
  const other = { left: 280, right: 500, top: 200, bottom: 400 };
  assert.deepEqual(placeBooleanRole(own, [other], [], viewport), { x: 264, y: 300 });
});
test("enclosed operands minimize the number of overlaps when some are unavoidable", () => {
  const enclosing = { left: -100, right: 900, top: -100, bottom: 700 };
  const other = { left: 280, right: 500, top: 200, bottom: 400 };
  assert.deepEqual(placeBooleanRole(own, [enclosing, other], [], viewport), { x: 264, y: 300 });
});
test("concentric controls remain separate and onscreen", () => {
  const first = placeBooleanRole(own, [own], [], viewport);
  const second = placeBooleanRole(own, [own], [first], viewport);
  assert.ok(Math.hypot(first.x - second.x, first.y - second.y) >= 36);
  for (const point of [first, second]) {
    assert.ok(point.x >= 16 && point.x <= 784 && point.y >= 16 && point.y <= 584);
  }
});
