import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { partition, shardIndex } from "../scripts/ci-partition.mjs";
import { uiSuites } from "../scripts/ci-ui-suites.mjs";

test("longest-first assignment preserves every suite exactly once and balances heavy cases", () => {
  const suites = [100, 90, 80, 70, 60, 50].map((seconds, i) => ({ id: `${i}`, seconds }));
  const shards = partition(suites, 3);
  assert.deepEqual(
    shards.map((shard) => shard.seconds),
    [150, 150, 150],
  );
  assert.deepEqual(
    shards
      .flatMap((shard) => shard.suites)
      .map((s) => s.id)
      .sort(),
    suites.map((s) => s.id),
  );
  assert.throws(() => partition([...suites, suites[0]], 3), /Duplicate/);
  assert.throws(() => partition([{ id: "bad", seconds: 0 }], 1), /Invalid timing/);
});

test("UI inventory has runnable entry points, unique commands and complete browser partitions", async () => {
  for (const suite of uiSuites) await access(new URL(suite.args[0], import.meta.url));
  for (const browser of ["chromium", "webkit", "electron"]) {
    const suites = uiSuites
      .filter((s) => s.browsers.includes(browser))
      .map((s) => ({ ...s, id: s.args.join(" ") }));
    const shards = partition(suites, 16);
    assert.ok(shards.every((s) => s.suites.length));
    assert.deepEqual(
      shards
        .flatMap((s) => s.suites)
        .map((s) => s.id)
        .sort(),
      suites.map((s) => s.id).sort(),
    );
    const totals = shards.map((s) => s.seconds);
    assert.ok(Math.max(...totals) - Math.min(...totals) <= 30, `${browser}: ${totals}`);
  }
});

test("ordinary route migration covers all routes, with only constrained rotation retained on Mac", async () => {
  const source = await readFile(new URL("current-tools-ui.mjs", import.meta.url), "utf8");
  const routes = [...source.matchAll(/^ {6}(\w+Route),$/gm)].map((m) => m[1]);
  assert.equal(routes.length, 20);
  const suites = uiSuites.filter((s) => s.args[0] === "current-tools-ui.mjs");
  assert.deepEqual(suites.map((s) => s.args[1].slice("--route=".length)).sort(), routes.sort());
  assert.deepEqual(
    suites.filter((s) => !s.browsers.includes("webkit")).map((s) => s.args[1]),
    ["--route=transformRoute"],
  );
});

test("widget and edge partitions use disjoint subsets without losing any family", () => {
  const subsets = (file) =>
    uiSuites
      .filter((s) => s.args[0] === file)
      .map((s) => s.args[1])
      .sort();
  assert.deepEqual(subsets("widget-reachability-ui.mjs"), [
    "adjacent",
    "axial",
    "blend",
    "body",
    "cards",
    "extrude",
    "planar",
    "plane",
    "revolve",
    "topology",
  ]);
  assert.deepEqual(subsets("edge-finish-ui.mjs"), [
    "adjacent",
    "faces",
    "grid",
    "motion",
    "periodic",
    "zero",
  ]);
});

test("shard arguments cannot silently omit a partition", () => {
  assert.deepEqual(shardIndex("3/4"), { index: 2, count: 4 });
  for (const bad of ["0/4", "5/4", "1/0", "1", undefined]) assert.throws(() => shardIndex(bad));
});
