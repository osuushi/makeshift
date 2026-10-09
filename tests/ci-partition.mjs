import assert from "node:assert/strict";
import { access, readdir } from "node:fs/promises";
import test from "node:test";
import { macModelCases, macModelPattern, modelPartitions } from "../scripts/ci-model-suites.mjs";
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

test("PR UI coverage stays bounded, Electron-only and tied to lower-level coverage", async () => {
  assert.ok(uiSuites.length <= 20, "Review the UI budget before adding another permanent journey");
  for (const suite of uiSuites) {
    await access(new URL(suite.args[0], import.meta.url));
    await access(new URL(suite.unit, import.meta.url));
    assert.deepEqual(suite.browsers, ["electron"], "Cross-browser matrices are opt-in review");
    assert.ok(
      suite.reason.length > 30,
      "Explain the integration failure lower-level tests cannot catch",
    );
  }
  const suites = uiSuites.map((suite) => ({ ...suite, id: suite.args.join(" ") }));
  const shards = partition(suites, 3);
  assert.ok(shards.every((shard) => shard.suites.length));
  assert.ok(
    shards.reduce((sum, shard) => sum + shard.seconds, 0) <= 500,
    "Keep the regression gate within its aggregate execution budget",
  );
  assert.deepEqual(
    shards.flatMap((shard) => shard.suites.map((suite) => suite.id)).sort(),
    suites.map((suite) => suite.id).sort(),
  );
});

test("shard arguments cannot silently omit a partition", () => {
  assert.deepEqual(shardIndex("3/4"), { index: 2, count: 4 });
  for (const bad of ["0/4", "5/4", "1/0", "1", undefined]) assert.throws(() => shardIndex(bad));
});

test("platform filtering retains every file and only the seven reproduced Mac cases", async () => {
  const files = (await readdir(new URL(".", import.meta.url)))
    .filter((file) => file.endsWith(".test.ts"))
    .map((file) => file.replace(/\.ts$/, ".js"));
  files.push("new-unmeasured.test.js");
  const linux = modelPartitions(files, "linux", 5).flatMap((s) => s.suites.map((s) => s.id));
  const mac = modelPartitions(files, "mac", 1).flatMap((s) => s.suites.map((s) => s.id));
  assert.deepEqual(linux.sort(), files.sort());
  assert.deepEqual(mac.sort(), [...new Set(macModelCases.map((c) => c.file))].sort());
  assert.ok(linux.includes("new-unmeasured.test.js"));
  assert.equal(macModelCases.length, 7);
  const pattern = new RegExp(macModelPattern);
  for (const { name } of macModelCases) {
    assert.ok(pattern.test(name));
    assert.ok(!pattern.test(`${name} adjacent`), "Filter matches the whole test name");
  }
  assert.ok(
    !pattern.test(
      "captured erosion cancels promptly, preserves history and restarts the native worker",
    ),
  );
  assert.throws(() => modelPartitions([], "mac", 1), /Missing required Mac test/);
});
