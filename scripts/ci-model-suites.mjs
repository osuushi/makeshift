import assert from "node:assert/strict";
import times from "./ci-model-times.json" with { type: "json" };
import { partition } from "./ci-partition.mjs";

// Numerical cases failed unchanged on Linux in run 37874047517; erosion limits
// also failed in runs 37922405765 and 37945256817. Preserve their assertions on Mac.
export const macModelCases = [
  {
    file: "body-erosion-special-boundaries.test.js",
    name: "complex erosion preserves rigid placement: sphere-plane-fillet",
    seconds: 3,
  },
  {
    file: "body-erosion-special.test.js",
    name: "special erosion: sphere-plane-fillet",
    seconds: 2,
  },
  {
    file: "erosion-responsiveness.test.js",
    name: "captured original erosion allowance produces a result that can be reopened",
    seconds: 3,
  },
  {
    file: "erosion-responsiveness.test.js",
    name: "captured tight allowance fails quickly and its suggested allowance succeeds",
    seconds: 12,
  },
  {
    file: "offset-move-capture.test.js",
    name: "captured tilted plate moves its hole along world X and reverses after reopening",
    seconds: 29,
  },
  {
    file: "offset-thickness.test.js",
    name: "spherical thickness offsets the radius with a fixed concentric reference",
    seconds: 1,
  },
  {
    file: "projection.test.js",
    name: "cut cone hyperbola and parabola edges project from exact BRep curves",
    seconds: 1,
  },
];
const macFiles = new Set(macModelCases.map(({ file }) => file));
const escaped = macModelCases.map(({ name }) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
export const macModelPattern = `^(?:${escaped.join("|")})$`;

export function modelPartitions(files, platform, count) {
  assert.ok(platform === "linux" || platform === "mac", "Choose linux or mac");
  for (const file of macFiles)
    assert.ok(files.includes(file), `Missing required Mac test: ${file}`);
  const selected = platform === "mac" ? files.filter((file) => macFiles.has(file)) : files;
  return partition(
    selected.map((id) => {
      const macSeconds = macModelCases
        .filter(({ file }) => file === id)
        .reduce((sum, c) => sum + c.seconds, 0);
      return {
        id,
        seconds: platform === "mac" ? macSeconds : Math.max(1, (times[id] ?? 1) - macSeconds),
      };
    }),
    count,
  );
}
