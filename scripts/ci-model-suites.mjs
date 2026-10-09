import assert from "node:assert/strict";
import times from "./ci-model-times.json" with { type: "json" };
import { partition } from "./ci-partition.mjs";

// Unchanged numerical/OCCT cases with documented Linux failures.
export const macModelFiles = new Set([
  "body-erosion-special.test.js",
  "body-erosion-special-boundaries.test.js",
  "offset-move-capture.test.js",
  "offset-thickness.test.js",
  "projection.test.js",
  "erosion-responsiveness.test.js",
]);

export function modelPartitions(files, platform, count) {
  assert.ok(platform === "linux" || platform === "mac", "Choose linux or mac");
  for (const file of macModelFiles)
    assert.ok(files.includes(file), `Missing required Mac test: ${file}`);
  const eligible = files.filter((file) => macModelFiles.has(file) === (platform === "mac"));
  return partition(
    eligible.map((id) => ({ id, seconds: times[id] ?? 1 })),
    count,
  );
}
