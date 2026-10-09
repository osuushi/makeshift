import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { partition, shardIndex } from "./ci-partition.mjs";
import { uiSuites } from "./ci-ui-suites.mjs";

const [browser, shard, mode] = process.argv.slice(2);
assert.ok(["chromium", "webkit", "electron"].includes(browser), "Choose a CI browser");
assert.ok(!mode || mode === "--list", "Only --list is supported");
const { index, count } = shardIndex(shard);
const suites = uiSuites
  .filter((suite) => suite.browsers.includes(browser))
  .map((suite) => ({ ...suite, id: suite.args.join(" ") }));
const selected = partition(suites, count)[index];
assert.ok(selected.suites.length, "CI must run a nonempty shard");
console.log(
  `${browser} ${shard}: ${selected.suites.length} suites, estimated ${selected.seconds}s`,
);
let failed = false;
for (const suite of selected.suites) {
  console.log(`CI suite: ${suite.id}`);
  if (mode === "--list") continue;
  const start = performance.now();
  const result = spawnSync(process.execPath, [`tests/${suite.args[0]}`, ...suite.args.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, MAKESHIFT_TEST_BROWSER: browser },
  });
  console.log(`CI timing: ${suite.id}: ${Math.ceil((performance.now() - start) / 1000)}s`);
  if (result.error) throw result.error;
  if (result.status !== 0) failed = true;
}
if (failed) process.exit(1);
