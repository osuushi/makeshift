// Source-only at creation. Run both executables serially under the compute lock.
// node verify-streaming-cuts.mjs BASELINE CANDIDATE OUTPUT.jsonl
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cases, square } from "./cases.mjs";
import { Client, operand } from "./client.mjs";

const digest = (text) => createHash("sha256").update(text).digest("hex");
const rect = (x, y, width, height) => ({
  outer: square(0, 0, 1).outer.map(({ kind, a, b }) => ({
    kind,
    a: [x + a[0] * width, y + a[1] * height, 0],
    b: [x + b[0] * width, y + b[1] * height, 0],
  })),
  holes: [],
});
const sweep = (profile, distance, bodies = [], mode = "subtract", extra = {}) => ({
  kind: "extrude",
  normal: [0, 0, 1],
  profiles: [profile],
  distance,
  bodies,
  mode,
  ...extra,
});
function differences(a, b, path = "reply", result = []) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) result.push({ path: `${path}.length`, a: a.length, b: b.length });
    for (let i = 0; i < Math.max(a.length, b.length); ++i)
      differences(a[i], b[i], `${path}[${i}]`, result);
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    const keysA = Object.keys(a).sort(),
      keysB = Object.keys(b).sort();
    if (JSON.stringify(keysA) !== JSON.stringify(keysB))
      result.push({ path: `${path}.keys`, a: keysA, b: keysB });
    for (const key of new Set([...keysA, ...keysB])) {
      if (key === "brep" && typeof a[key] === "string" && typeof b[key] === "string") continue;
      differences(a[key], b[key], `${path}.${key}`, result);
    }
  } else if (!Object.is(a, b)) result.push({ path, a: a ?? null, b: b ?? null });
  return result;
}
function encodings(reply) {
  return (reply.results ?? []).map((result) => ({
    length: result.brep?.length ?? null,
    sha256: typeof result.brep === "string" ? digest(result.brep) : null,
  }));
}
function expectation(reply, expected) {
  const failures = [];
  if (expected.error !== undefined && Boolean(reply.error) !== expected.error)
    failures.push(`expected error=${expected.error}`);
  if (expected.mode && reply.mode !== expected.mode)
    failures.push(`expected mode=${expected.mode}`);
  if (
    expected.participants &&
    JSON.stringify(reply.participants) !== JSON.stringify(expected.participants)
  )
    failures.push(`expected participants=${JSON.stringify(expected.participants)}`);
  if (expected.results !== undefined && reply.results?.length !== expected.results)
    failures.push(`expected ${expected.results} results`);
  return failures;
}
async function fixtures(path) {
  const client = new Client(path, 4);
  try {
    const bodies = [];
    for (const [id, x, y] of [
      ["stock-a", 0, 0],
      ["stock-b", 0, 20],
      ["far", 100, 0],
    ]) {
      const { reply } = await client.request(sweep(square(x, y, 10), 10, [], "new"));
      if (reply.error || reply.results.length !== 1)
        throw new Error(`Fixture ${id}: ${reply.error}`);
      bodies.push(operand(reply.results[0], id));
    }
    const cubic = (await cases(client)).find(([name]) => name === "cubic-subtract-implicit");
    if (!cubic) throw new Error("Missing cubic fixture");
    return { bodies, cubic };
  } finally {
    await client.close();
  }
}
function focusedCases({ bodies: [a, b, far], cubic }) {
  const cut = (bodies, mode = "subtract", extra = {}) =>
    sweep(rect(4, -1, 2, 32), 12, bodies, mode, extra);
  const one = [a.id],
    two = [a.id, b.id],
    reversed = [b.id, a.id];
  const list = [
    [
      "eligible-one",
      cut([a, b], "subtract", { eligibleTargets: one }),
      { error: false, mode: "subtract", participants: one, results: 2 },
    ],
    ["empty-eligible-subtract", cut([a, b], "subtract", { eligibleTargets: [] }), { error: true }],
    [
      "empty-eligible-auto",
      cut([a, b], "auto", { eligibleTargets: [] }),
      { error: false, mode: "union", participants: [], results: 1 },
    ],
    [
      "eligible-explicit-intersection",
      cut([a, b], "auto", { targets: two, eligibleTargets: [b.id] }),
      { error: false, mode: "subtract", participants: [b.id], results: 2 },
    ],
    [
      "implicit-split-two",
      cut([a, b]),
      { error: false, mode: "subtract", participants: two, results: 4 },
    ],
    [
      "explicit-auto-target-list-order",
      cut([a, b], "auto", { targets: reversed }),
      { error: false, mode: "subtract", participants: two, results: 4 },
    ],
    [
      "explicit-auto-body-order",
      cut([b, a], "auto", { targets: two }),
      { error: false, mode: "subtract", participants: reversed, results: 4 },
    ],
    [
      "explicit-auto-disjoint-first",
      cut([far, a], "auto", { targets: [a.id, far.id] }),
      { error: false, mode: "subtract", participants: [far.id, a.id], results: 3 },
    ],
    [
      "explicit-auto-disjoint-last",
      cut([a, far], "auto", { targets: [far.id, a.id] }),
      { error: false, mode: "subtract", participants: [a.id, far.id], results: 3 },
    ],
    [
      "neutral-auto-far",
      sweep(square(50, 50, 2), 2, [a], "auto"),
      { error: false, mode: "union", participants: [], results: 1 },
    ],
    [
      "neutral-auto-explicit-far",
      sweep(square(50, 50, 2), 2, [a], "auto", { targets: one }),
      { error: false, mode: "union", participants: one, results: 2 },
    ],
    [
      "contact-only-auto",
      sweep(square(10, 0, 10), 10, [a], "auto"),
      { error: false, mode: "union", participants: one, results: 1 },
    ],
    ["disjoint-implicit-subtract-error", sweep(square(50, 50, 2), 2, [a]), { error: true }],
    ["empty-targets-subtract-error", cut([a], "subtract", { targets: [] }), { error: true }],
    [
      "implicit-intersect-control",
      cut([a, b], "intersect"),
      { error: false, mode: "intersect", participants: two, results: 2 },
    ],
    ["cubic-positive-subtract", cubic[1], { error: false, mode: "subtract" }],
  ];
  // Tiny contained tools straddle the 1e-10 positive-volume classification budget.
  // Labels give nominal analytic volumes, not a claimed observed kernel threshold.
  for (const [size, nominalVolume] of [
    [1e-4, 1e-12],
    [1e-3, 1e-9],
  ])
    for (const mode of ["subtract", "auto"])
      list.push([
        `contained-tool-${nominalVolume}-${mode}`,
        sweep(square(2, 2, size), size, [a], mode),
        mode === "subtract"
          ? { error: nominalVolume < 1e-10 }
          : { error: false, mode: nominalVolume < 1e-10 ? "union" : "subtract", participants: one },
      ]);
  return list;
}
function worker(path) {
  const client = new Client(path, 4);
  let rawReply;
  client.lines.on("line", (line) => {
    rawReply = line;
  });
  return {
    client,
    async request(input) {
      return { ...(await client.request(input)), rawReply };
    },
  };
}
async function inspectSources(worker, bodies) {
  const { reply, rawReply } = await worker.request({ kind: "inspect", bodies });
  if (reply.error) throw new Error(`Source inspect failed: ${reply.error}`);
  return { encodings: encodings(reply), rawReply };
}
async function configuration(output, paths, sources) {
  await writeFile(
    output,
    `${JSON.stringify({
      type: "configuration",
      paths,
      threads: 4,
      repeats: 3,
      exactMetadata: true,
      binaries: Object.fromEntries(
        await Promise.all(
          Object.entries(paths).map(async ([label, path]) => [label, digest(await readFile(path))]),
        ),
      ),
      sourceEncoding: encodings({ results: sources }),
      note: "Only BRep string contents excluded from exact full-reply comparison. Source strings remain immutable JS inputs; repeated inspect decodes new shapes and cannot prove in-request TShape immutability. True repair/error injection deferred.",
    })}\n`,
  );
}
async function run() {
  const [base, candidate, outputArg] = process.argv.slice(2);
  if (!base || !candidate || !outputArg || process.argv.length !== 5)
    throw new Error("Usage: verify-streaming-cuts.mjs BASELINE CANDIDATE OUTPUT.jsonl");
  const paths = { baseline: resolve(base), candidate: resolve(candidate) },
    output = resolve(outputArg);
  const fixture = await fixtures(paths.baseline),
    items = focusedCases(fixture);
  const sources = [...fixture.bodies, ...fixture.cubic[1].bodies];
  const inputSnapshot = JSON.stringify(sources),
    workers = {},
    initial = {},
    first = {};
  const totals = { crossDifferences: 0, repeatDifferences: 0, expectationFailures: 0 };
  await configuration(output, paths, sources);
  try {
    for (const [label, path] of Object.entries(paths)) {
      workers[label] = worker(path);
      initial[label] = await inspectSources(workers[label], sources);
      await appendFile(
        output,
        `${JSON.stringify({ type: "source-before", label, ...initial[label] })}\n`,
      );
    }
    for (const [name, input, expected] of items) {
      const serialized = JSON.stringify(input);
      await appendFile(output, `${JSON.stringify({ type: "input", name, input, expected })}\n`);
      for (let repeat = 0; repeat < 3; ++repeat) {
        const pair = {};
        for (const label of repeat % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"])
          pair[label] = await workers[label].request(input);
        for (const label of ["baseline", "candidate"]) {
          const current = pair[label],
            key = `${label}:${name}`;
          first[key] ??= current.reply;
          const repeatDiffs = differences(first[key], current.reply);
          const crossDiffs =
            label === "candidate" ? differences(pair.baseline.reply, current.reply) : [];
          const failures = expectation(current.reply, expected);
          totals.repeatDifferences += repeatDiffs.length;
          totals.crossDifferences += crossDiffs.length;
          totals.expectationFailures += failures.length;
          await appendFile(
            output,
            `${JSON.stringify({
              type: "reply",
              name,
              label,
              repeat,
              rawReply: current.rawReply,
              encodings: encodings(current.reply),
              repeatDiffs,
              crossDiffs,
              expectationFailures: failures,
            })}\n`,
          );
        }
        if (JSON.stringify(input) !== serialized) throw new Error(`JS input mutated: ${name}`);
      }
    }
    for (const label of Object.keys(workers)) {
      const after = await inspectSources(workers[label], sources);
      await appendFile(
        output,
        `${JSON.stringify({
          type: "source-after",
          label,
          ...after,
          exactRepeatEncoding:
            JSON.stringify(after.encodings) === JSON.stringify(initial[label].encodings),
          jsInputsUnchanged: JSON.stringify(sources) === inputSnapshot,
        })}\n`,
      );
    }
    await appendFile(output, `${JSON.stringify({ type: "summary", totals })}\n`);
    console.log(JSON.stringify(totals));
    if (totals.crossDifferences || totals.expectationFailures) process.exitCode = 1;
  } finally {
    for (const item of Object.values(workers)) await item.client.close();
  }
}
await run();
