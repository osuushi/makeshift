import assert from "node:assert/strict";
import test from "node:test";
import { initialTouchMode } from "../src/sketch/touch-mode.js";

test("iPhone starts with finger editing while iPad and desktop retain camera defaults", () => {
  for (const platform of ["iPhone", "iPod"])
    assert.equal(initialTouchMode(platform, null), "pointer");
  for (const platform of ["iPad", "MacIntel", "Linux armv8l", "Win32"])
    assert.equal(initialTouchMode(platform, null), "camera");
});

test("explicit touch preferences win over the device default", () => {
  for (const platform of ["iPhone", "iPad", "MacIntel"])
    for (const saved of ["camera", "pointer"] as const)
      assert.equal(initialTouchMode(platform, saved), saved);
});

test("invalid saved preferences fall back to the device default", () => {
  assert.equal(initialTouchMode("iPhone", "invalid"), "pointer");
  assert.equal(initialTouchMode("iPad", "invalid"), "camera");
});
