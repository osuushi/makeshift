// Correctness harness only; caller holds /tmp/makeshift-geometry-compute.lock.
// Usage: node verify-twist-volumes.mjs BASELINE CANDIDATE OUTPUT.jsonl [FILTER=.*]
// Full native replies and traces are retained. Construction stays strictly serial.
import assert from "node:assert/strict";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "./client.mjs";

const [baseline, candidate, output, filterText = ".*"] = process.argv.slice(2);
assert.ok(baseline && candidate && output, "Expected BASELINE CANDIDATE OUTPUT.jsonl [FILTER]");
const filter = new RegExp(filterText);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const frames = [
  { name: "z", normal: [0, 0, 1], u: [1, 0, 0] },
  { name: "x", normal: [1, 0, 0], u: [0, 1, 0] },
  { name: "y", normal: [0, 1, 0], u: [0, 0, 1] },
  {
    name: "diagonal",
    normal: [1, 1, 1].map((v) => v / Math.sqrt(3)),
    u: [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0],
  },
];
function input(frame, angle, distance, offset, overrides = {}) {
  return {
    kind: "extrude",
    mode: "new",
    bodies: [],
    normal: frame.normal,
    distance,
    profiles: [
      {
        outer: [
          { kind: "circle", center: [0, 0, 0], radius: 10, normal: frame.normal, axis: frame.u },
        ],
        holes: [],
      },
    ],
    twist: { angle, origin: frame.u.map((v) => v * offset) },
    ...overrides,
  };
}
function fixtures() {
  const result = [];
  for (const frame of frames) {
    for (const distance of [20, -20]) {
      for (const centered of [true, false]) {
        const angle = centered ? 30 : 90;
        result.push({
          name: `circle-${frame.name}-${distance > 0 ? "forward" : "backward"}-${centered ? "centered30" : "offset90"}`,
          input: input(frame, angle, distance, centered ? 0 : 5),
          nominalVolume: Math.PI * 100 * Math.abs(distance),
        });
      }
    }
  }
  const z = frames[0];
  for (const angle of [0, 30, 180]) {
    result.push({
      name: `circle-z-offset${angle}`,
      input: input(z, angle, 20, 5),
      nominalVolume: Math.PI * 2000,
    });
  }
  result.push({
    name: "circle-z-offset90-symmetric",
    input: input(z, 90, 20, 5, { symmetric: true }),
    nominalVolume: Math.PI * 2000,
  });
  result.push({
    name: "circle-z-offset90-neutral-auto",
    input: input(z, 90, 20, 5, { mode: "auto" }),
    nominalVolume: Math.PI * 2000,
  });
  for (const twist of [0, 90]) {
    result.push({
      name: `circle-z-offset${twist}-draft-control`,
      input: input(z, twist, 20, 5, { draft: { mode: "offset", value: 1 } }),
      nominalVolume: null,
    });
  }
  const frame = frames[3],
    v = cross(frame.normal, frame.u);
  const points = [
    [-10, -10],
    [10, -10],
    [10, 10],
    [-10, 10],
  ].map(([a, b]) => frame.u.map((component, axis) => component * a + v[axis] * b));
  result.push({
    name: "polygon-diagonal-offset90-control",
    input: input(frame, 90, 20, 5, {
      profiles: [
        {
          outer: points.map((a, i) => ({ kind: "line", a, b: points[(i + 1) % points.length] })),
          holes: [],
        },
      ],
    }),
    nominalVolume: 8000,
  });
  return result.filter(({ name }) => filter.test(name));
}
function compare(a, b, path = "reply", tolerance = 1e-9) {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(
      Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)),
      `${path}: ${a} != ${b}`,
    );
  } else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${path}.length`);
    a.forEach((value, i) => {
      compare(value, b[i], `${path}[${i}]`, tolerance);
    });
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const key of Object.keys(a))
      if (key !== "brep") compare(a[key], b[key], `${path}.${key}`, tolerance);
  } else assert.deepEqual(a, b, path);
}
function match(a, b, tolerance = 1e-9) {
  try {
    compare(a, b, "reply", tolerance);
    return "matched";
  } catch (error) {
    return error.message;
  }
}
function volumes(reply, nominal) {
  if (reply.error) return { error: reply.error };
  const actual = reply.results.map((result) => result.volume);
  const total = actual.reduce((sum, volume) => sum + volume, 0);
  return {
    actual,
    total,
    nominalVolume: nominal,
    nominalAbsoluteDifference: nominal === null ? null : total - nominal,
    nominalRelativeDifference: nominal === null ? null : (total - nominal) / nominal,
  };
}
const selected = fixtures();
assert.ok(selected.length, "No selected fixtures");
await writeFile(output, "", { flag: "wx" });
const clients = [baseline, candidate].map((executable) => new Client(resolve(executable), 1));
let failed = false;
try {
  for (const fixture of selected) {
    const a = await clients[0].request(fixture.input);
    const repeated = await clients[0].request(fixture.input);
    const b = await clients[1].request(fixture.input);
    const va = volumes(a.reply, fixture.nominalVolume),
      vb = volumes(b.reply, fixture.nominalVolume);
    const record = {
      name: fixture.name,
      input: fixture.input,
      baselineExecutable: resolve(baseline),
      candidateExecutable: resolve(candidate),
      baseline: a.reply,
      baselineRepeat: repeated.reply,
      candidate: b.reply,
      baselineTrace: a.phases,
      baselineRepeatTrace: repeated.phases,
      candidateTrace: b.phases,
      baselineRepeatMatch: match(a.reply, repeated.reply),
      fullReplyMatch: match(a.reply, b.reply),
      volumeMatch:
        va.error || vb.error ? "unavailable: native error" : match(va.actual, vb.actual, 1e-10),
      baselineVolumes: va,
      candidateVolumes: vb,
      nominalNote:
        "Nominal section-area times travel is an ideal sweep reference, not proof of the fitted BRep's actual volume. Draft controls intentionally omit a nominal reference.",
      comparisonNote:
        "Full reply tolerance1e-9, volume tolerance1e-10, both scaled by max(1,abs(a),abs(b)); BRep contents only ignored. Traces are correctness diagnostics, not performance measurements.",
    };
    await appendFile(output, `${JSON.stringify(record)}\n`);
    console.error(`${fixture.name}: reply ${record.fullReplyMatch}; volume ${record.volumeMatch}`);
    if (record.baselineRepeatMatch === "matched" && record.fullReplyMatch !== "matched")
      failed = true;
    if (record.volumeMatch !== "matched" && !a.reply.error) failed = true;
    if (a.reply.error || b.reply.error) failed = true;
  }
} finally {
  for (const client of clients) await client.close();
}
if (failed) process.exitCode = 1;
