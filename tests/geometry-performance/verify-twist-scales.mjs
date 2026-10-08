// Correctness only; caller holds /tmp/makeshift-geometry-compute.lock.
// Usage: node verify-twist-scales.mjs BASELINE CANDIDATE OUTPUT.jsonl [FILTER=.*]
// Preserve full replies; true relative volume checks never use a max(1,...) floor.
import assert from "node:assert/strict";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "./client.mjs";

const [baseline, candidate, output, filterText = ".*"] = process.argv.slice(2);
assert.ok(baseline && candidate && output, "Expected BASELINE CANDIDATE OUTPUT.jsonl [FILTER]");
const filter = new RegExp(filterText);
const minimumVolume = 1e-12;
const circle = (radius) => ({
  kind: "circle",
  center: [0, 0, 0],
  radius,
  normal: [0, 0, 1],
  axis: [1, 0, 0],
});
function fixture(scale, offset, annulus = false, travelFactor = 1) {
  const radius = 10 * scale,
    distance = 20 * scale * travelFactor;
  const nominal = Math.PI * (radius ** 2 - (annulus ? (radius / 2) ** 2 : 0)) * distance;
  return {
    name: `${annulus ? "annulus" : "circle"}-s${scale}-${offset ? "offset90" : "centered30"}${travelFactor === 1 ? "" : "-slender"}`,
    scale,
    radius,
    distance,
    nominalVolume: nominal,
    analyticInvariant: !offset,
    nominalThresholdClass:
      nominal < minimumVolume
        ? "below-minimum"
        : nominal === minimumVolume
          ? "at-minimum"
          : "above-minimum",
    input: {
      kind: "extrude",
      mode: "new",
      bodies: [],
      normal: [0, 0, 1],
      distance,
      profiles: [{ outer: [circle(radius)], holes: annulus ? [[circle(radius / 2)]] : [] }],
      twist: { angle: offset ? 90 : 30, origin: [offset ? 5 * scale : 0, 0, 0] },
    },
  };
}
function fixtures() {
  const cases = [];
  for (const scale of [0.000005, 0.00001, 0.0001, 0.001, 0.01, 1]) {
    for (const offset of [false, true]) cases.push(fixture(scale, offset));
  }
  for (const scale of [0.01, 1]) cases.push(fixture(scale, false, true));
  for (const offset of [false, true]) cases.push(fixture(1, offset, false, 0.001));
  return cases.filter(({ name }) => filter.test(name));
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
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a)) if (key !== "brep") compare(a[key], b[key], `${path}.${key}`);
  } else assert.deepEqual(a, b, path);
}
function match(a, b) {
  try {
    compare(a, b);
    return "matched";
  } catch (error) {
    return error.message;
  }
}
function geometry(reply, expected) {
  if (reply.error) return { error: reply.error, results: null, totalVolume: null };
  const results = reply.results.map(({ volume, faces, edges, brep }) => ({
    volume,
    faces: faces.length,
    edges: edges.length,
    brepBytes: brep.length / 2,
  }));
  const total = results.reduce((sum, result) => sum + result.volume, 0);
  return {
    error: null,
    results,
    resultCount: results.length,
    totalVolume: total,
    actualThresholdClass:
      total < minimumVolume
        ? "below-minimum"
        : total === minimumVolume
          ? "at-minimum"
          : "above-minimum",
    nominalAbsoluteDifference: total - expected.nominalVolume,
    // Only the centered circle/annulus is an analytic invariant, not a fitted sweep.
    analyticRelativeDifference: expected.analyticInvariant
      ? (total - expected.nominalVolume) / expected.nominalVolume
      : null,
    fittedNominalRelativeDifference: expected.analyticInvariant
      ? null
      : (total - expected.nominalVolume) / expected.nominalVolume,
  };
}
function relative(a, b) {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === 0) return b === 0 ? 0 : null;
  return (b - a) / Math.abs(a);
}
function exactBrep(a, b) {
  if (a.error || b.error) return null;
  return (
    a.results.length === b.results.length &&
    a.results.every((result, i) => result.brep === b.results[i].brep)
  );
}
const selected = fixtures();
assert.ok(selected.length, "No selected cases");
await writeFile(output, "", { flag: "wx" });
const clients = [baseline, candidate].map((executable) => new Client(resolve(executable), 1));
let regression = false;
try {
  for (const expected of selected) {
    const a = await clients[0].request(expected.input);
    const repeated = await clients[0].request(expected.input);
    const b = await clients[1].request(expected.input);
    const ga = geometry(a.reply, expected),
      gb = geometry(b.reply, expected);
    const delta = relative(ga.totalVolume, gb.totalVolume);
    const record = {
      ...expected,
      minimumVolume,
      baselineExecutable: resolve(baseline),
      candidateExecutable: resolve(candidate),
      baseline: a.reply,
      baselineRepeat: repeated.reply,
      candidate: b.reply,
      baselineTrace: a.phases,
      baselineRepeatTrace: repeated.phases,
      candidateTrace: b.phases,
      baselineGeometry: ga,
      candidateGeometry: gb,
      baselineCandidateRelativeVolumeDifference: delta,
      relativeVolumeTolerance: 1e-10,
      relativeVolumeMatch: delta === null ? null : Math.abs(delta) <= 1e-10,
      baselineRepeatRelativeVolumeDifference: relative(
        ga.totalVolume,
        geometry(repeated.reply, expected).totalVolume,
      ),
      baselineRepeatFullMatch: match(a.reply, repeated.reply),
      baselineCandidateFullMatch: match(a.reply, b.reply),
      baselineRepeatExactBrepEqual: exactBrep(a.reply, repeated.reply),
      baselineCandidateExactBrepEqual: exactBrep(a.reply, b.reply),
      note: "Full output numeric tolerance1e-9 uses max1; separate volume difference is genuinely relative with no max1 floor. Centered sweep nominal is an analytic invariant. Offset fitted-sweep nominal is diagnostic only; no certified fitted-BRep volume claim. Native errors and threshold classifications are retained.",
    };
    await appendFile(output, `${JSON.stringify(record)}\n`);
    console.error(
      `${expected.name}: relative ${delta}; ${record.baselineCandidateFullMatch}; baseline=${ga.error ?? "ok"}, candidate=${gb.error ?? "ok"}`,
    );
    if (
      record.baselineRepeatFullMatch === "matched" &&
      record.baselineCandidateFullMatch !== "matched"
    )
      regression = true;
    if (!a.reply.error && b.reply.error) regression = true;
    if (record.relativeVolumeMatch === false) regression = true;
  }
} finally {
  for (const client of clients) await client.close();
}
if (regression) process.exitCode = 1;
