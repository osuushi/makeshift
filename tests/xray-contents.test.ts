import assert from "node:assert/strict";
import test from "node:test";
import {
  applicationPreferences,
  configurePreferences,
} from "../src/preferences/application-preferences.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { projectXrayContents, xrayContains } from "../src/sketch/xray-contents.js";

const circle = {
  ...emptySketch(planes.XY),
  curves: [
    {
      id: "circle",
      kind: "circle" as const,
      construction: false,
      center: { x: 0, y: 0 },
      radius: 10,
    },
  ],
};
const open = {
  ...emptySketch(planes.XY),
  curves: [
    {
      id: "line",
      kind: "segment" as const,
      construction: false,
      a: { x: 30, y: 0 },
      b: { x: 40, y: 0 },
    },
  ],
};
const other = { ...circle, plane: planes.XZ };

test("X-ray aperture uses actual coplanar region interiors and open curves, without plane bounds", () => {
  const contents = projectXrayContents(
    [circle, open, other],
    planes.XY,
    ([x, y]) => ({ x, y }),
    0.1,
  );
  assert.equal(contents.paths.length, 2);
  assert.equal(contents.regions.length, 1);
  assert.equal(xrayContains(contents, { x: 0, y: 0 }, 0), true, "Filled interior belongs to mask");
  assert.equal(xrayContains(contents, { x: 35, y: 2.5 }, 3), true, "Bleed surrounds open curves");
  assert.equal(xrayContains(contents, { x: 35, y: 4 }, 3), false);
  assert.equal(
    xrayContains(contents, { x: 20, y: 0 }, 3),
    false,
    "Gap between disconnected contents stays opaque",
  );
  assert.equal(xrayContains(contents, { x: 12, y: 0 }, 3), true);
  assert.equal(xrayContains(contents, { x: 14, y: 0 }, 3), false);
});

test("Mask expansion stays in screen pixels through zoom and includes coplanar sketches with other bases", () => {
  const translated = {
    ...open,
    plane: { ...planes.XY, origin: [0, 5, 0] as [number, number, number] },
  };
  for (const zoom of [1, 3]) {
    const contents = projectXrayContents(
      [translated],
      planes.XY,
      ([x, y]) => ({ x: x * zoom, y: y * zoom }),
      0.1 / zoom,
    );
    assert.equal(xrayContains(contents, { x: 35 * zoom, y: 5 * zoom + 3 }, 4), true);
    assert.equal(xrayContains(contents, { x: 35 * zoom, y: 5 * zoom + 5 }, 4), false);
  }
  assert.equal(xrayContains({ paths: [], regions: [] }, { x: 0, y: 0 }, 100), false);
});

test("X-ray settings validate atomically and retain mask values independently of Global", () => {
  const original = applicationPreferences();
  try {
    configurePreferences('{"viewDisplay":{"xrayGlobal":false,"xrayBleed":25,"xrayRadius":8}}');
    configurePreferences('{"viewDisplay":{"xrayGlobal":true,"bodyXrayOpacity":0.25}}');
    configurePreferences('{"viewDisplay":{"sectionFrontOpacity":0.9}}');
    assert.equal(applicationPreferences().viewDisplay.bodyXrayOpacity, 0.25);
    assert.equal(applicationPreferences().viewDisplay.sectionFrontOpacity, 0.9);
    assert.equal(applicationPreferences().viewDisplay.xrayBleed, 25);
    assert.equal(applicationPreferences().viewDisplay.xrayRadius, 8);
    const before = applicationPreferences();
    for (const patch of [
      { xrayGlobal: 1 },
      { bodyXrayOpacity: -0.1 },
      { bodyXrayOpacity: 1.1 },
      { bodyXrayOpacity: "0.5" },
      { xrayRadius: -1 },
      { xrayBleed: 101 },
      { xrayRadius: "4" },
    ]) {
      assert.throws(() =>
        configurePreferences(JSON.stringify({ viewDisplay: { grid: 0, ...patch } })),
      );
      assert.deepEqual(applicationPreferences(), before);
    }
  } finally {
    configurePreferences(JSON.stringify(original));
  }
});
