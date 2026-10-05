import assert from "node:assert/strict";
import test from "node:test";
import {
  fitWidgets,
  freeCardSpace,
  rectsOverlap,
  type WidgetRect,
  widgetPathsSafe,
  widgetSweptRect,
} from "../src/model/widget-viewport.js";

const viewport = { x: 500, y: 350, width: 984, height: 684 };
function assertReachable(targets: WidgetRect[], obstacles: WidgetRect[]) {
  targets.forEach((target, i) => {
    assert.ok(target.x - target.width / 2 >= 8);
    assert.ok(target.x + target.width / 2 <= 992);
    assert.ok(target.y - target.height / 2 >= 8);
    assert.ok(target.y + target.height / 2 <= 692);
    for (const other of [...obstacles, ...targets.slice(0, i)])
      assert.equal(rectsOverlap(target, other), false);
  });
}

test("offscreen Extrude/Twist/axis and measured card fit with header/cube/panel obstacles", () => {
  const obstacles = [
    { x: 300, y: 35, width: 580, height: 42 },
    { x: 110, y: 240, width: 190, height: 300 },
    { x: 910, y: 90, width: 144, height: 144 },
    { x: 875, y: 475, width: 230, height: 350 },
  ];
  for (const point of [
    { x: -500, y: -500 },
    { x: 1000, y: 0 },
    { x: 1200, y: 1000 },
  ]) {
    const targets = [
      { ...point, width: 64, height: 64 },
      { ...point, width: 64, height: 64 },
      { ...point, width: 20, height: 20 },
      { ...point, width: 225, height: 190 },
    ];
    const placed = fitWidgets(targets, obstacles, viewport);
    assertReachable(placed, obstacles);
    assert.deepEqual(fitWidgets(targets, obstacles, viewport), placed);
  }
});

test("current CSS measurements work for scaled glyphs and dense Scale assemblies", () => {
  for (const scale of [0.8, 1, 1.5]) {
    const targets = Array.from({ length: 27 }, (_, i) => ({
      x: i % 2 ? 1500 : -400,
      y: i % 3 ? 900 : -300,
      width: 18 * scale,
      height: 18 * scale,
    }));
    assertReachable(fitWidgets(targets, [], viewport), []);
  }
});

test("unobstructed positions and viewport offset remain exact", () => {
  const targets = [{ x: 410, y: 390, width: 64, height: 64 }];
  assert.deepEqual(fitWidgets(targets, [], viewport), targets);
  const shifted = { x: 600, y: 450, width: 984, height: 684 };
  const result = fitWidgets([{ x: -100, y: 400, width: 64, height: 64 }], [], shifted);
  assert.equal(result[0].x, 140.01);
});

test("impossible small viewports and occupied layouts are explicit limited fits", () => {
  const target = { x: -400, y: 900, width: 64, height: 64 };
  const tiny = { x: 2, y: 2, width: 0, height: 0 };
  assert.deepEqual(fitWidgets([target], [], tiny), [{ ...target, x: 2, y: 2, limited: true }]);
  const occupied = fitWidgets([target], [viewport], viewport)[0];
  assert.equal(occupied.limited, true);
});

test("narrow cards find scrollable strips which avoid occupied chrome", () => {
  const narrow = { x: 160, y: 120, width: 304, height: 224 };
  const obstacles = [
    { x: 160, y: 32.5, width: 300, height: 45 },
    { x: 103, y: 140, width: 190, height: 150 },
  ];
  const card = { x: 1200, y: 800, width: 300, height: 112 };
  const free = freeCardSpace(card, obstacles, narrow);
  assert.ok(free);
  assert.ok(free.width >= 64 && free.height >= 32);
  assert.ok(free.width < card.width);
  for (const other of obstacles) assert.equal(rectsOverlap(free, other), false);
});

test("correction animation requires a safe entire path, including idle camera jumps", () => {
  const viewport = { x: 100, y: 100, width: 200, height: 200 };
  const target = { x: 40, y: 60, width: 20, height: 20 };
  assert.equal(widgetPathsSafe([target], [{ ...target, x: 70 }], [], viewport), true);
  assert.equal(widgetPathsSafe([{ ...target, x: -20 }], [target], [], viewport), false);
  assert.equal(
    widgetPathsSafe(
      [target],
      [{ ...target, x: 150 }],
      [{ x: 100, y: 60, width: 30, height: 30 }],
      viewport,
    ),
    false,
  );
  assert.equal(
    widgetPathsSafe([target, { ...target, x: 160 }], [{ ...target, x: 160 }, target], [], viewport),
    false,
  );
});

test("swept rectangles reserve every intermediate silhouette, including stationary corrections", () => {
  const current = { x: 523, y: 400, width: 48, height: 48 };
  const desired = { ...current, x: 400, width: 30 };
  const swept = widgetSweptRect(current, desired);
  assert.deepEqual(swept, { x: 466, y: 400, width: 162, height: 48 });
  for (const x of [400, 440, 523])
    assert.equal(rectsOverlap(swept, { x, y: 400, width: 18, height: 18 }), true);
  assert.deepEqual(widgetSweptRect(current, current), current);
  assert.deepEqual(widgetSweptRect(desired, current), swept);
});
