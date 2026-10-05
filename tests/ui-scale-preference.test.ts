import assert from "node:assert/strict";
import test from "node:test";
import { onUiScaleChange, setUiScale, uiScale } from "../src/preferences/ui-scale.js";

test("display preferences safely default without a DOM or device storage", () => {
  assert.equal(uiScale(), 1);
  let changes = 0;
  const dispose = onUiScaleChange(() => changes++);
  setUiScale(1.5);
  assert.equal(uiScale(), 1.5);
  setUiScale(Number.NaN);
  assert.equal(uiScale(), 1);
  setUiScale(0.01);
  assert.equal(uiScale(), 1);
  assert.equal(changes, 3);
  dispose();
  setUiScale(1);
  assert.equal(changes, 3);
});
