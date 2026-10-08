// Usage: node summarize-volume-comparison.mjs INPUT.jsonl [OUTPUT.json] [baselineLabel]
// Paired block resampling retains correlation between configurations.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const rows = readFileSync(process.argv[2], "utf8").trim().split("\n").map(JSON.parse);
const run = rows.find((row) => row.type === "run");
const baselineLabel = process.argv[4] ?? run?.configurations[0].label;
assert.ok(baselineLabel, "Missing baseline label");
const measured = rows.filter((row) => row.type === "volume" && row.nativeBlock === 0);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
let seed = 20261008;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const summary = [];
for (const fixture of new Set(measured.map((row) => row.fixture))) {
  for (const axis of new Set(
    measured.filter((row) => row.fixture === fixture).map((row) => row.axis),
  )) {
    const group = measured.filter((row) => row.fixture === fixture && row.axis === axis);
    const baseline = group.filter((row) => row.label === baselineLabel);
    assert.ok(baseline.length, `Missing baseline for ${fixture}/${axis}`);
    assert.equal(
      new Set(baseline.map((row) => row.block)).size,
      baseline.length,
      "Duplicate baseline block",
    );
    for (const label of new Set(group.map((row) => row.label))) {
      const samples = group.filter((row) => row.label === label);
      assert.equal(samples.length, baseline.length, "Incomplete paired blocks");
      assert.equal(
        new Set(samples.map((row) => row.block)).size,
        samples.length,
        "Duplicate candidate block",
      );
      const pairs = samples.map((row) => {
        const reference = baseline.find((candidate) => candidate.block === row.block);
        assert.ok(reference, "Missing paired reference");
        return { row, reference };
      });
      const usable = pairs.filter(
        ({ row, reference }) =>
          !row.exception &&
          !reference.exception &&
          row.mass !== null &&
          reference.mass !== null &&
          row.error !== null &&
          reference.error !== null &&
          row.error >= 0 &&
          reference.error >= 0 &&
          row.ms > 0 &&
          reference.ms > 0,
      );
      const ratios = usable.map(({ row, reference }) => reference.ms / row.ms);
      const bootstrap = [];
      if (ratios.length) {
        for (let i = 0; i < 10000; ++i) {
          bootstrap.push(median(ratios.map(() => ratios[Math.floor(random() * ratios.length)])));
        }
      }
      summary.push({
        fixture,
        axis,
        label,
        baselineLabel,
        n: samples.length,
        validPairs: usable.length,
        medianMs: median(samples.map((row) => row.ms)),
        p95Ms: quantile(
          samples.map((row) => row.ms),
          0.95,
        ),
        pairedMedianSpeedup: ratios.length ? median(ratios) : null,
        bootstrap95: ratios.length
          ? [quantile(bootstrap, 0.025), quantile(bootstrap, 0.975)]
          : null,
        // Runner preserves IEEE bits before JSON serialization can discard signed zero.
        exactMassMatches: usable.filter(({ row, reference }) => row.massBits === reference.massBits)
          .length,
        exactErrorMatches: usable.filter(
          ({ row, reference }) => row.errorBits === reference.errorBits,
        ).length,
        massMismatches: usable
          .filter(({ row, reference }) => row.massBits !== reference.massBits)
          .map(({ row, reference }) => ({
            block: row.block,
            baseline: reference.mass,
            candidate: row.mass,
          })),
        errorMismatches: usable
          .filter(({ row, reference }) => row.errorBits !== reference.errorBits)
          .map(({ row, reference }) => ({
            block: row.block,
            baseline: reference.error,
            candidate: row.error,
          })),
        failures: samples
          .filter(
            (row) => row.exception || row.mass === null || row.error === null || row.error < 0,
          )
          .map(({ block, exception, mass, error }) => ({ block, exception, mass, error })),
      });
    }
  }
}
const text = `${JSON.stringify(summary, null, 2)}\n`;
if (process.argv[3]) writeFileSync(process.argv[3], text);
else process.stdout.write(text);
