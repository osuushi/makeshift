// Usage: node summarize-memory.mjs INPUT.jsonl [INPUT2.jsonl ...] [--output SUMMARY.json]
// Also accepts a final positional SUMMARY.json after the JSONL paths.
// Offline analysis only: no native processes, geometry requests, or input mutation.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const argumentsList = process.argv.slice(2);
const outputIndex = argumentsList.indexOf("--output");
let output;
if (outputIndex >= 0) {
  assert.equal(outputIndex, argumentsList.length - 2, "Expected --output SUMMARY.json at end");
  output = argumentsList[outputIndex + 1];
  argumentsList.splice(outputIndex, 2);
} else if (argumentsList.length > 1 && !argumentsList.at(-1).endsWith(".jsonl")) {
  output = argumentsList.pop();
}
assert.ok(argumentsList.length, "Expected INPUT.jsonl paths [--output SUMMARY.json]");
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const quantile = (values, fraction) =>
  values.length
    ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]
    : null;
let seed = 20261008;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
function statistics(values) {
  return {
    n: values.length,
    medianMiB: median(values),
    p95MiB: quantile(values, 0.95),
    minMiB: values.length ? Math.min(...values) : null,
    maxMiB: values.length ? Math.max(...values) : null,
  };
}
function difference(values) {
  if (!values.length) return { n: 0, medianMiB: null, bootstrap95MiB: null };
  const bootstrap = [];
  for (let i = 0; i < 10000; ++i) {
    bootstrap.push(median(values.map(() => values[Math.floor(random() * values.length)])));
  }
  return {
    n: values.length,
    medianMiB: median(values),
    bootstrap95MiB: [quantile(bootstrap, 0.025), quantile(bootstrap, 0.975)],
  };
}
function memory(row, position, field) {
  const snapshot = row[`nativeMemory${position}`];
  const value = snapshot?.[field];
  return snapshot?.available && typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value / 1024
    : null;
}
function compare(a, b, path = "reply") {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(
      Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: ${a} != ${b}`,
    );
  } else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${path}.length`);
    a.forEach((value, i) => {
      compare(value, b[i], `${path}[${i}]`);
    });
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    // Preserve every metadata key and all ordering, including display triangles.
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) if (key !== "brep") compare(a[key], b[key], `${path}.${key}`);
  } else {
    assert.deepEqual(a, b, path);
  }
}
async function representatives(baseline, samples) {
  const reference = baseline.find((row) => row.representative);
  const candidate = samples.find((row) => row.representative);
  if (!reference || !candidate)
    return { status: "unavailable", reason: "Missing representative path" };
  try {
    const a = JSON.parse(await readFile(reference.representative, "utf8"));
    const b = JSON.parse(await readFile(candidate.representative, "utf8"));
    let status = "matched";
    try {
      compare(a, b);
    } catch (error) {
      status = error.message;
    }
    return {
      status,
      baselinePath: reference.representative,
      candidatePath: candidate.representative,
      baselineError: a.error ?? null,
      candidateError: b.error ?? null,
      tolerance: 1e-9,
      ignoredValue: "brep only; key presence/order still compared",
      baselineRepeatCheck: "unavailable: one saved full reply per configuration",
    };
  } catch (error) {
    return {
      status: "unavailable",
      reason: error.message,
      baselinePath: reference.representative,
      candidatePath: candidate.representative,
    };
  }
}
const summary = [];
for (const filename of argumentsList) {
  const dataset = resolve(filename);
  const contents = (await readFile(dataset, "utf8")).trim();
  assert.ok(contents, `Empty dataset: ${dataset}`);
  const rows = contents
    .split("\n")
    .map(JSON.parse)
    .filter((row) => !row.warmup && typeof row.name === "string");
  assert.ok(rows.length, `No measurement rows: ${dataset}`);
  for (const name of new Set(rows.map((row) => row.name))) {
    const group = rows.filter((row) => row.name === name);
    const baselineLabel = group[0].referenceLabel ?? group[0].label;
    const baseline = group.filter((row) => row.label === baselineLabel);
    assert.ok(baseline.length, `Missing baseline for ${dataset}/${name}`);
    assert.equal(
      new Set(baseline.map((row) => row.block)).size,
      baseline.length,
      "Duplicate baseline blocks",
    );
    for (const label of new Set(group.map((row) => row.label))) {
      const samples = group.filter((row) => row.label === label);
      assert.equal(
        new Set(samples.map((row) => row.block)).size,
        samples.length,
        "Duplicate candidate blocks",
      );
      const valid = samples.filter((row) => !row.outcome?.error);
      const pairs = valid.flatMap((row) => {
        const reference = baseline.find((item) => item.block === row.block && !item.outcome?.error);
        return reference ? [{ row, reference }] : [];
      });
      const fields = {};
      for (const field of ["VmHWMKiB", "VmRSSKiB", "VmPeakKiB"]) {
        const values = (position) =>
          valid.map((row) => memory(row, position, field)).filter((value) => value !== null);
        const paired = (position) =>
          pairs.flatMap(({ row, reference }) => {
            const a = memory(reference, position, field),
              b = memory(row, position, field);
            return a !== null && b !== null ? [b - a] : [];
          });
        fields[field.replace("KiB", "MiB")] = {
          before: statistics(values("Before")),
          after: statistics(values("After")),
          pairedCandidateMinusBaselineAfter: difference(paired("After")),
          pairedCandidateMinusBaselineBefore: difference(paired("Before")),
          missingBefore: valid.length - values("Before").length,
          missingAfter: valid.length - values("After").length,
        };
      }
      summary.push({
        dataset,
        name,
        label,
        baselineLabel,
        samples: samples.length,
        validSamples: valid.length,
        pairedSuccessfulRequests: pairs.length,
        memory: fields,
        errors: samples
          .filter((row) => row.outcome?.error)
          .map((row) => ({ block: row.block, error: row.outcome.error })),
        missingMemory: valid
          .filter((row) => !row.nativeMemoryAfter?.available)
          .map((row) => ({
            block: row.block,
            reason: row.nativeMemoryAfter?.reason ?? "Missing snapshot",
          })),
        fullOutput: await representatives(baseline, samples),
      });
    }
  }
}
const result = {
  notes: [
    "Each sample uses a fresh process; fixture construction happens in a separate process closed before sampling.",
    "VmHWM/VmPeak include native startup and the sole request. Snapshots are outside elapsed request timing; HWM is not a sampled per-request peak or peak delta.",
    "MiB equals proc KiB divided by 1024. Positive paired differences mean candidate uses more memory. Failed requests are excluded from memory summaries and retained as errors.",
    "Bootstrap95 intervals use seeded 10000 paired-block resamples of median absolute differences; small pilots have limited inference power.",
    "Representative comparison ignores BRep string contents only; all other numeric data use tolerance 1e-9 and metadata/display/topology ordering is preserved.",
  ],
  summary,
};
const text = `${JSON.stringify(result, null, 2)}\n`;
if (output) await writeFile(output, text);
else process.stdout.write(text);
