import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const rows = (await readFile(process.argv[2], "utf8"))
  .trim()
  .split("\n")
  .map(JSON.parse)
  .filter((row) => !row.warmup);
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const quantile = (values, fraction) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
let seed = 2817;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
function compare(a, b, path = "outcome") {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(
      Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: ${a} != ${b}`,
    );
  } else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, path);
    a.forEach((value, i) => {
      compare(value, b[i], `${path}[${i}]`);
    });
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) compare(a[key], b[key], `${path}.${key}`);
  } else assert.deepEqual(a, b, path);
}
// OCCT can enumerate generated entities differently even across serial repeats.
// Compare signature/predecessor pairs as multisets as well as ordered arrays;
// preserve each signature's association with its predecessor IDs.
function canonical(outcome) {
  if (outcome.error) return outcome;
  const key = (entity) =>
    JSON.stringify([
      entity.signature.map((number) => Number(number.toPrecision(7))),
      entity.origins,
    ]);
  const results = outcome.results.map((result) => {
    const { faceSignatures, faceOrigins, edgeSignatures, edgeOrigins, ...rest } = result;
    const entities = (signatures, origins, edges = false) =>
      signatures
        .map((signature, i) => ({
          // A unique edge's enumeration orientation comes from its first face use.
          // Keep face orientation; compare edge geometry without that use orientation.
          signature: edges ? signature.filter((_, index) => index !== 1) : signature,
          origins: [...origins[i]].sort(),
        }))
        .sort((a, b) => key(a).localeCompare(key(b)));
    return {
      ...rest,
      faceEntities: entities(faceSignatures, faceOrigins),
      edgeEntities: entities(edgeSignatures, edgeOrigins, true),
    };
  });
  results.sort((a, b) =>
    JSON.stringify(a.bounds.map((value) => Number(value.toPrecision(7)))).localeCompare(
      JSON.stringify(b.bounds.map((value) => Number(value.toPrecision(7)))),
    ),
  );
  return { ...outcome, results };
}
const names = [...new Set(rows.map((row) => row.name))];
const summary = [];
for (const name of names) {
  const cases = rows.filter((row) => row.name === name);
  const labels = [...new Set(cases.map((row) => row.label))];
  const referenceLabel = process.argv[4] ?? cases[0].referenceLabel ?? labels[0];
  const baseline = cases.filter((row) => row.label === referenceLabel);
  if (!baseline.length) throw new Error(`Missing reference ${referenceLabel} for ${name}`);
  for (const label of labels) {
    const samples = cases.filter((row) => row.label === label);
    let orderedEquivalence = "matched";
    try {
      for (const row of samples) compare(baseline[0].outcome, row.outcome);
    } catch (error) {
      orderedEquivalence = error.message;
    }
    let equivalence =
      "matched face and orientation-independent edge geometry/predecessor multisets";
    try {
      for (const row of samples) compare(canonical(baseline[0].outcome), canonical(row.outcome));
    } catch (error) {
      equivalence = error.message;
    }
    const ratios = samples.map((row) => {
      const reference = baseline.find((candidate) => candidate.block === row.block);
      return reference.milliseconds / row.milliseconds;
    });
    const resampled = [];
    for (let i = 0; i < 10000; i++) {
      const draw = ratios.map(() => ratios[Math.floor(random() * ratios.length)]);
      resampled.push(median(draw));
    }
    const phases = new Map();
    for (const row of samples)
      for (const line of row.phases.split("\n")) {
        const match = /^kernel (.+) ([\d.e+-]+) ms$/.exec(line);
        if (!match) continue;
        const list = phases.get(match[1]) ?? [];
        list.push(Number(match[2]));
        phases.set(match[1], list);
      }
    summary.push({
      name,
      label,
      n: samples.length,
      medianMs: median(samples.map((row) => row.milliseconds)),
      p95Ms: quantile(
        samples.map((row) => row.milliseconds),
        0.95,
      ),
      minMs: Math.min(...samples.map((row) => row.milliseconds)),
      maxMs: Math.max(...samples.map((row) => row.milliseconds)),
      pairedMedianSpeedup: median(ratios),
      bootstrap95: [quantile(resampled, 0.025), quantile(resampled, 0.975)],
      equivalence,
      orderedEquivalence,
      error: samples[0].outcome.error,
      phases: Object.fromEntries(
        [...phases].map(([key, values]) => [key, { medianMs: median(values), n: values.length }]),
      ),
    });
  }
}
const json = `${JSON.stringify(summary, null, 2)}\n`;
if (process.argv[3]) await writeFile(process.argv[3], json);
for (const row of summary) console.log(JSON.stringify({ ...row, phases: undefined }));
