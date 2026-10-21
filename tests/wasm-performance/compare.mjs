import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compare } from "./measure.mjs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error("Usage: compare.mjs BEFORE.json AFTER.json");
const before = JSON.parse(await readFile(beforePath, "utf8"));
const after = JSON.parse(await readFile(afterPath, "utf8"));
assert.equal(before.fixture.sha256, after.fixture.sha256, "Use the same captured fixture");
assert.deepEqual(before.host, after.host, "Use the same host and driver runtime");
for (const runtime of after.runtimes) {
  const baseline = before.runtimes.find((entry) => entry.name === runtime.name);
  assert.ok(baseline, `No baseline for ${runtime.name}`);
  assert.equal(runtime.version, baseline.version, "Use the same browser version");
  console.log(`\n${runtime.name}`);
  for (const scenario of runtime.cases) {
    const original = baseline.cases.find((entry) => entry.name === scenario.name);
    assert.ok(original, `No baseline for ${scenario.name}`);
    assert.equal(scenario.summary.size, original.summary.size);
    assert.equal(scenario.summary.probes, original.summary.probes);
    assert.ok([...original.comparisons, ...scenario.comparisons].every((item) => item.matches));
    for (const sample of [scenario.first, ...scenario.samples])
      compare(sample.outcome, original.first.outcome);
    const a = original.summary.median,
      b = scenario.summary.median;
    console.log(
      `  ${scenario.name}: ${a.toFixed(1)} -> ${b.toFixed(1)} ms (${((1 - b / a) * 100).toFixed(1)}% lower); geometry agrees`,
    );
  }
  for (const drag of runtime.drags ?? []) {
    const original = baseline.drags.find((entry) => entry.warm === drag.warm);
    console.log(`  ${drag.warm ? "warmed" : "first"} drag: before -> after`);
    for (const key of ["visibleUpdatesDuringDrag", "workerStarts", "workerTerminations"])
      console.log(`    ${key}: ${original[key]} -> ${drag[key]}`);
    for (const key of ["dragMilliseconds", "finalSettleMilliseconds"])
      console.log(`    ${key}: ${original[key].toFixed(1)} -> ${drag[key].toFixed(1)}`);
    console.log(
      `    mean delivered input interval: ${inputInterval(original).toFixed(1)} -> ${inputInterval(drag).toFixed(1)} ms`,
    );
  }
}

function inputInterval(drag) {
  return (drag.input.at(-1).time - drag.input[0].time) / Math.max(1, drag.input.length - 1);
}
