import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const rows = (await readFile(process.argv[2], "utf8"))
  .trim()
  .split("\n")
  .map(JSON.parse)
  .filter((row) => row.block >= 0);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b),
    middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
let seed = 487;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const family = (row) => row.config.split("-")[0];
const label = (row) => `${row.config}/obb${Number(row.obb)}/history${Number(row.history)}`;
function material(reference, row) {
  assert.ok(row.done && !row.warnings, "failed or warned operation");
  assert.equal(row.results.length, reference.results.length, "result count");
  row.results.forEach((result, i) => {
    const expected = reference.results[i];
    assert.ok(result.valid, "invalid BRep");
    assert.equal(result.occupancy, expected.occupancy, "material occupancy");
    assert.equal(result.solids, expected.solids, "solid count");
    assert.ok(
      Math.abs(result.volume - expected.volume) <= 1e-7 * Math.max(1, Math.abs(expected.volume)),
      "volume",
    );
  });
}
const summary = [];
for (const name of [...new Set(rows.map((row) => row.case))]) {
  for (const kind of ["fuse", "cut", "pair"]) {
    const group = rows.filter((row) => row.case === name && family(row) === kind);
    if (!group.length) continue;
    const referenceConfig = kind === "pair" ? "pair-separate" : `${kind}-sequential`;
    const baseline = group.filter(
      (row) => row.config === referenceConfig && !row.obb && row.history,
    );
    if (!baseline.length) throw new Error(`Missing baseline ${name}/${kind}`);
    for (const config of [...new Set(group.map(label))]) {
      const samples = group.filter((row) => label(row) === config);
      let equivalence = "valid, matching volumes, solid counts and 252 occupancy probes";
      try {
        for (const row of samples) material(baseline[0], row);
      } catch (error) {
        equivalence = error.message;
      }
      const ratios = samples.map(
        (row) => baseline.find((base) => base.block === row.block).build_ms / row.build_ms,
      );
      const resampled = [];
      for (let i = 0; i < 10000; i++)
        resampled.push(median(ratios.map(() => ratios[Math.floor(random() * ratios.length)])));
      summary.push({
        name,
        kind,
        config,
        n: samples.length,
        medianMs: median(samples.map((row) => row.build_ms)),
        minMs: Math.min(...samples.map((row) => row.build_ms)),
        maxMs: Math.max(...samples.map((row) => row.build_ms)),
        p95Ms: quantile(
          samples.map((row) => row.build_ms),
          0.95,
        ),
        pairedMedianSpeedup: median(ratios),
        bootstrap95: [quantile(resampled, 0.025), quantile(resampled, 0.975)],
        equivalence,
        topology: samples[0].results.map(({ faces, edges, solids }) => ({ faces, edges, solids })),
      });
    }
  }
}
if (process.argv[3]) await writeFile(process.argv[3], `${JSON.stringify(summary, null, 2)}\n`);
for (const row of summary) console.log(JSON.stringify(row));
