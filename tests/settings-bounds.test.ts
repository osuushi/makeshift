import assert from "node:assert/strict";
import test from "node:test";
import { settingsBounds } from "../src/host/settings-bounds.js";

test("a taller Settings tab stays inside the work area including native chrome", () => {
  assert.deepEqual(
    settingsBounds({ x: 700, y: 700, width: 520, height: 300 }, 800, 28, {
      x: 0,
      y: 25,
      width: 1440,
      height: 950,
    }),
    { x: 700, y: 147, width: 520, height: 828 },
  );
});
test("oversize content fits an offset display while fitting tabs retain their position", () => {
  const work = { x: -1280, y: 40, width: 1280, height: 720 };
  const current = { x: -800, y: 180, width: 520, height: 300 };
  assert.deepEqual(settingsBounds(current, 300, 28, work), { ...current, height: 328 });
  assert.deepEqual(settingsBounds(current, 1600, 28, work), {
    x: -800,
    y: 40,
    width: 520,
    height: 720,
  });
});
