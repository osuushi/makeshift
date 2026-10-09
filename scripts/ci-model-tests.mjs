import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";

import { modelPartitions } from "./ci-model-suites.mjs";
import { shardIndex } from "./ci-partition.mjs";

const [platform, shard] = process.argv.slice(2);
const { index, count } = shardIndex(shard ?? "1/1");
const directory = ".cache/sketch-tests/tests";
const files = (await readdir(directory)).filter((file) => file.endsWith(".test.js")).sort();
const assigned = modelPartitions(files, platform, count)[index];
const selected = assigned.suites.map(({ id }) => id);
assert.ok(selected.length, "CI must run a nonempty test partition");
console.log(
  `${platform}: estimated ${assigned.seconds}s, ${selected.length}/${files.length} test files${shard ? `, shard ${shard}` : ""}`,
);
const result = spawnSync(
  process.execPath,
  ["--test", "--test-concurrency=1", ...selected.map((file) => `${directory}/${file}`)],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
