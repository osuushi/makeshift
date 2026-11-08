import assert from "node:assert/strict";
import test from "node:test";
import { playbackPlan } from "../scripts/bugs/playback.mjs";

test("playback preserves prebuffer, gaps, overlapping segments and end boundary", () => {
  const plan = playbackPlan({
    startedAt: 5000,
    endedAt: 9000,
    media: [
      { name: "video-0001.webm", start: 4000, end: 7000 },
      { name: "video-0000.webm", start: 1000, end: 3000 },
      { name: "video-0002.webm", start: 6500, end: 10000 },
    ],
  });
  assert.equal(plan.origin, 1000);
  assert.equal(plan.duration, 8);
  assert.deepEqual(plan.parts, [
    { name: "video-0000.webm", frames: 16, seek: 0 },
    { frames: 8 },
    { name: "video-0001.webm", frames: 24, seek: 0 },
    { name: "video-0002.webm", frames: 16, seek: 0.5 },
  ]);
});
test("fractional segment boundaries do not accumulate timing drift", () => {
  const media = Array.from({ length: 100 }, (_, i) => ({
    name: `video-${String(i).padStart(4, "0")}.webm`,
    start: i * 1001,
    end: (i + 1) * 1001,
  }));
  const plan = playbackPlan({ startedAt: 0, endedAt: 100100, media });
  assert.equal(
    plan.parts.reduce((sum, part) => sum + part.frames, 0),
    801,
  );
});
