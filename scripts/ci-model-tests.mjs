import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdir } from "node:fs/promises";
import { macModelCases, macModelPattern, modelPartitions } from "./ci-model-suites.mjs";
import { shardIndex } from "./ci-partition.mjs";

const [platform, shard] = process.argv.slice(2);
const { index, count } = shardIndex(shard ?? "1/1");
assert.ok(platform !== "mac" || count === 1, "The focused Mac regressions run together");
const directory = ".cache/sketch-tests/tests";
const files = (await readdir(directory)).filter((file) => file.endsWith(".test.js")).sort();
const assigned = modelPartitions(files, platform, count)[index];
assert.ok(assigned.suites.length, "CI must run a nonempty test partition");
console.log(
  `${platform} ${shard ?? "1/1"}: estimated ${assigned.seconds}s, ${assigned.suites.length} files`,
);
const filter = platform === "mac" ? "--test-name-pattern" : "--test-skip-pattern";
const child = spawn(
  process.execPath,
  [
    "--test",
    "--test-reporter=spec",
    "--test-concurrency=1",
    `${filter}=${macModelPattern}`,
    ...assigned.suites.map(({ id }) => `${directory}/${id}`),
  ],
  { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, NO_COLOR: "1" } },
);
let summary = "";
child.stdout.on("data", (chunk) => {
  process.stdout.write(chunk);
  summary = (summary + chunk).slice(-2048);
});
const [status] = await once(child, "close");
if (status !== 0) process.exit(status ?? 1);
// A renamed/deleted fixture must not silently turn the focused Mac gate into zero tests.
if (platform === "mac") assert.match(summary, new RegExp(`^ℹ pass ${macModelCases.length}$`, "m"));
