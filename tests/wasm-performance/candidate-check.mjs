import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compare } from "./measure.mjs";

const paths = process.argv.slice(2);
if (paths.length < 2)
  throw new Error("Usage: candidate-check.mjs BASELINE.json CANDIDATE.json [...]");
const reports = await Promise.all(
  paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const baseline = reports[0];
for (const [index, report] of reports.entries()) {
  if (!index) continue;
  assert.deepEqual(report.inputs, baseline.inputs, "Identical operations required");
  assert.deepEqual(
    report.assets,
    baseline.assets,
    "Use the same experimental binary for all modes",
  );
  assert.deepEqual(report.host, baseline.host, "Use the same host/runtime");
  for (const runtime of report.runtimes) {
    const original = baseline.runtimes.find((item) => item.name === runtime.name);
    assert.ok(original);
    assert.equal(runtime.version, original.version);
    for (const scenario of runtime.cases) {
      const before = original.cases.find((item) => item.name === scenario.name);
      assert.ok(before);
      assert.ok(!scenario.failure && !before.failure);
      assert.ok([...before.comparisons, ...scenario.comparisons].every((item) => item.matches));
      for (const sample of [scenario.first, ...scenario.samples]) {
        compare(sample.outcome, before.first.outcome);
        if (!sample.outcome.error)
          assert.equal(typeof sample.outcome.replyHash, "string", "Full reply hash required");
        assert.equal(
          sample.outcome.replyHash,
          before.first.outcome.replyHash,
          `${scenario.name}: complete reply changed`,
        );
      }
    }
    const gpu = runtime.initialization.candidates;
    if (gpu.mode === "gpu" || gpu.mode === "invalid-gpu") {
      assert.equal(gpu.ready, true, "Hardware GPU must actually initialize");
      const stats = runtime.cases.flatMap((item) =>
        [item.first, ...item.samples].flatMap((sample) =>
          sample.probes.map((probe) => probe.candidates),
        ),
      );
      for (const batch of stats)
        assert.equal(batch?.calls, batch?.completed, "Every requested GPU batch must complete");
      assert.ok(
        stats.some((item) => item?.completed > 0),
        "GPU must actually finish candidate batches",
      );
    }
  }
  console.log(
    `${paths[index]}: identical full replies, matching binary, GPU activity verified when requested`,
  );
}
