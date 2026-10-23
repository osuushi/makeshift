import assert from "node:assert/strict";
import test from "node:test";
import { advanceMarkerFade, desireMarker, type MarkerFade } from "../src/guides/marker-fade.js";

const ghost = (): MarkerFade => ({ desired: true, born: 0, updated: 0, opacity: 0 });

test("a briefly discovered ghost completes its 100ms dwell then fades out over 100ms", () => {
  const state = ghost();
  desireMarker(state, false, 20, false);
  assert.equal(state.opacity, 0.2);
  assert.equal(advanceMarkerFade(state, 100, false), true);
  assert.equal(state.opacity, 1);
  advanceMarkerFade(state, 150, false);
  assert.equal(state.opacity, 0.5);
  assert.equal(advanceMarkerFade(state, 200, false), false);
  assert.equal(state.opacity, 0);
});

test("dwell and fade produce the same result with delayed or frequent frames", () => {
  const frequent = ghost(),
    delayed = ghost();
  desireMarker(frequent, false, 20, false);
  desireMarker(delayed, false, 20, false);
  for (const now of [40, 60, 80, 100, 120, 140, 160]) advanceMarkerFade(frequent, now, false);
  advanceMarkerFade(delayed, 160, false);
  assert.ok(Math.abs(frequent.opacity - 0.4) < 1e-12);
  assert.ok(Math.abs(delayed.opacity - frequent.opacity) < 1e-12);
});

test("rediscovery reverses an outgoing fade continuously without restarting dwell", () => {
  const state = ghost();
  advanceMarkerFade(state, 100, false);
  desireMarker(state, false, 100, false);
  desireMarker(state, true, 150, false);
  assert.equal(state.opacity, 0.5);
  assert.equal(advanceMarkerFade(state, 200, false), false);
  assert.equal(state.opacity, 1);
  desireMarker(state, false, 200, false);
  advanceMarkerFade(state, 250, false);
  assert.equal(state.opacity, 0.5);
});

test("saved markers appear and disappear immediately, while stale frame timestamps cannot rewind fades", () => {
  const saved = { ...ghost(), opacity: 1 };
  desireMarker(saved, false, 10, true);
  assert.equal(advanceMarkerFade(saved, 10, true), false);
  assert.equal(saved.opacity, 0);
  const state = ghost();
  advanceMarkerFade(state, 50, false);
  advanceMarkerFade(state, 20, false);
  assert.equal(state.opacity, 0.5);
  assert.equal(state.updated, 50);
});
