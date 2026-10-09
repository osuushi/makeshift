import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";

import { partition, shardIndex } from "./ci-partition.mjs";

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
const { index, count } = shardIndex(shard ?? "1/1");
const directory = ".cache/sketch-tests/tests";
const files = (await readdir(directory)).filter((file) => file.endsWith(".test.js")).sort();
for (const file of mac) assert.ok(files.includes(file), `Missing required Mac test: ${file}`);
const eligible = files.filter((file) => mac.has(file) === (platform === "mac"));
const times = JSON.parse(await readFile(new URL("./ci-model-times.json", import.meta.url), "utf8"));
const selected = partition(
  eligible.map((id) => ({ id, seconds: times[id] ?? 1 })),
  count,
)[index].suites.map(({ id }) => id);
assert.ok(selected.length, "CI must run a nonempty test partition");
console.log(
  `${platform}: ${selected.length}/${files.length} test files${shard ? `, shard ${shard}` : ""}`,
);
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...selected.map((file) => `${directory}/${file}`)],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
