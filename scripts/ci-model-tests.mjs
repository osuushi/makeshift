import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";

// These existing numerical/OCCT cases remain required on Mac during the Linux migration.
const mac = new Set([
  "body-erosion-special.test.js",
  "body-erosion-special-boundaries.test.js",
  "offset-move-capture.test.js",
  "offset-thickness.test.js",
  "projection.test.js",
  "erosion-responsiveness.test.js",
]);
const [platform, shard] = process.argv.slice(2);
assert.ok(platform === "linux" || platform === "mac", "Choose linux or mac");
assert.ok(
  platform === "mac" ? !shard : /^[1-4]\/4$/.test(shard ?? ""),
  "Linux needs shard 1/4–4/4",
);
const directory = ".cache/sketch-tests/tests";
const files = (await readdir(directory)).filter((file) => file.endsWith(".test.js")).sort();
for (const file of mac) assert.ok(files.includes(file), `Missing required Mac test: ${file}`);
const selected = files.filter((file) => mac.has(file) === (platform === "mac"));
assert.ok(selected.length, "CI must run a nonempty test partition");
console.log(
  `${platform}: ${selected.length}/${files.length} test files${shard ? `, shard ${shard}` : ""}`,
);
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "--test-concurrency=1",
    ...(shard ? [`--test-shard=${shard}`] : []),
    ...selected.map((file) => `${directory}/${file}`),
  ],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
