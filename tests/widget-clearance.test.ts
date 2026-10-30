import assert from "node:assert/strict";
import test from "node:test";
import { separateWidgets, type WidgetTarget } from "../src/model/widget-clearance.js";

function assertClear(targets: WidgetTarget[], obstacles: WidgetTarget[]) {
  targets.forEach((target, index) => {
    for (const other of [...targets.slice(0, index), ...obstacles]) {
      const gap = (target.size + other.size) / 2 + 6;
      assert.ok(Math.abs(target.x - other.x) >= gap || Math.abs(target.y - other.y) >= gap);
    }
  });
}

test("coincident projected controls separate along their ray, including the anchor and box", () => {
  const targets = [48, 48, 30, 30].map((size) => ({ x: 60, y: -60, size }));
  const obstacles = [
    { x: 0, y: 0, size: 20 },
    { x: 110, y: -110, size: 16 },
  ];
  const result = separateWidgets(targets, obstacles);
  assertClear(result, obstacles);
  for (const point of result) {
    assert.equal(point.x, -point.y);
    assert.ok(point.x >= 60);
  }
  assert.deepEqual(separateWidgets(targets, obstacles), result);
});

test("clear positions remain unchanged and an end-on projection has a finite fallback", () => {
  const clear = [
    { x: 96, y: 0, size: 48 },
    { x: 0, y: 96, size: 48 },
  ];
  assert.deepEqual(separateWidgets(clear, []), clear);
  const targets = Array.from({ length: 7 }, () => ({ x: 0, y: 0, size: 48 }));
  const obstacles = [{ x: 0, y: 0, size: 20 }];
  const result = separateWidgets(targets, obstacles);
  assertClear(result, obstacles);
  assert.ok(result.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test("crowded projections clear every target across a full orbit without a search cap", () => {
  const obstacles = Array.from({ length: 26 }, (_, i) => ({
    x: (i % 5) * 28 - 56,
    y: Math.floor(i / 5) * 28 - 56,
    size: 16,
  }));
  for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
    const targets = Array.from({ length: 7 }, (_, i) => ({
      x: Math.cos(angle + i) * 60,
      y: Math.sin(angle - i) * 60,
      size: i < 3 ? 48 : 30,
    }));
    assertClear(separateWidgets(targets, obstacles), obstacles);
  }
});
