import assert from "node:assert/strict";
import test from "node:test";
import { readSettingsSize, settingsTabBounds } from "../src/host/settings-bounds.js";

const current = { x: 700, y: 700, width: 760, height: 720 };
const frame = { width: 0, height: 28 };
const work = { x: 0, y: 25, width: 1440, height: 950 };

test("ordinary preference panes are fixed to their measured content, including native chrome", () => {
  const size = {
    tab: "Interface",
    width: 550,
    height: 225,
    minimumHeight: 225,
    maximumHeight: 225,
  };
  assert.deepEqual(settingsTabBounds(size, current, frame, work), {
    resizable: false,
    min: { width: 550, height: 253 },
    max: { width: 550, height: 253 },
    preferred: { x: 700, y: 700, width: 550, height: 253 },
  });
});
test("Toolbox resizes vertically from measured group heights up to its content or display", () => {
  const size = { tab: "Toolbox", width: 550, height: 700, minimumHeight: 450, maximumHeight: 2200 };
  assert.deepEqual(settingsTabBounds(size, current, frame, work), {
    resizable: true,
    min: { width: 550, height: 478 },
    max: { width: 550, height: 950 },
    preferred: { x: 700, y: 247, width: 550, height: 728 },
  });
});
test("a physically smaller display clamps measured content and native frames without a second scale", () => {
  const size = { tab: "View", width: 900, height: 1000, minimumHeight: 1000, maximumHeight: 1000 };
  const result = settingsTabBounds(
    size,
    current,
    { width: 16, height: 39 },
    { x: -640, y: 40, width: 640, height: 480 },
  );
  assert.deepEqual(result.preferred, { x: -640, y: 40, width: 640, height: 480 });
  assert.deepEqual(result.min, result.max);
  assert.throws(() => readSettingsSize({ ...size, tab: "invalid" }));
  assert.throws(() => readSettingsSize({ ...size, height: Number.NaN }));
  assert.throws(() => readSettingsSize({ ...size, minimumHeight: 1100 }));
});
