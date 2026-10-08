// Source-only at creation; run geometry only under the orchestrator's compute lock.
// node repeat-shell-output.mjs BASELINE CANDIDATE OUT.jsonl [20] [reuse|fresh] [INPUT.json]

import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cases } from "./cases.mjs";
import { Client } from "./client.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
function differences(a, b, path = "reply", result = []) {
  if (typeof a === "number" && typeof b === "number") {
    if (
      !Number.isFinite(a) ||
      !Number.isFinite(b) ||
      Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
    )
      result.push({ path, baseline: a, observed: b });
  } else if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length)
      result.push({ path: `${path}.length`, baseline: a.length, observed: b.length });
    for (let i = 0; i < Math.max(a.length, b.length); ++i)
      differences(a[i], b[i], `${path}[${i}]`, result);
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a),
      bKeys = Object.keys(b);
    if (JSON.stringify(aKeys) !== JSON.stringify(bKeys))
      result.push({ path: `${path}.keys`, baseline: aKeys, observed: bKeys });
    for (const key of new Set([...aKeys, ...bKeys])) {
      if (key === "brep") continue; // Exact BRep comparison is separate.
      differences(a[key], b[key], `${path}.${key}`, result);
    }
  } else if (a !== b) result.push({ path, baseline: a ?? null, observed: b ?? null });
  return result;
}
function breps(reply) {
  return (reply.results ?? []).map((result) => result.brep ?? null);
}
function brepComparison(reference, observed) {
  const a = breps(reference),
    b = breps(observed);
  return {
    exactMatch: JSON.stringify(a) === JSON.stringify(b),
    baseline: a.map((value) =>
      value === null ? null : { length: value.length, sha256: digest(value) },
    ),
    observed: b.map((value) =>
      value === null ? null : { length: value.length, sha256: digest(value) },
    ),
  };
}
function faceDescriptor(result, index) {
  const face = result.faces?.[index];
  if (!face) return { index, missing: true };
  return {
    index,
    face,
    incidentEdges: (face.edgeIndexes ?? []).map((edgeIndex) => ({
      index: edgeIndex,
      edge: result.edges?.[edgeIndex],
    })),
  };
}
function targetEvidence(reply) {
  return (reply.results ?? []).map((result, resultIndex) => {
    const source = result.faces?.[1],
      chosen = source?.thickness?.faceIndex;
    const indices = new Set([31, 36]);
    if (Number.isInteger(chosen)) indices.add(chosen);
    return {
      resultIndex,
      volume: result.volume,
      bounds: result.bounds,
      source: faceDescriptor(result, 1),
      chosenIndex: chosen ?? null,
      targets: [...indices].map((index) => faceDescriptor(result, index)),
    };
  });
}
function instrument(path) {
  const client = new Client(path, 4);
  let lastRaw = "";
  client.lines.on("line", (line) => {
    lastRaw = line;
  });
  return {
    client,
    async request(input) {
      const result = await client.request(input);
      return { ...result, rawReply: lastRaw };
    },
  };
}
async function inputFor(path, supplied) {
  if (supplied) return JSON.parse(await readFile(supplied, "utf8"));
  const client = new Client(path, 4);
  try {
    const item = (await cases(client)).find(([name]) => name === "shell-perforated-closed");
    if (!item) throw new Error("Missing shell-perforated-closed fixture");
    return item[1];
  } finally {
    await client.close();
  }
}
function runArguments() {
  const [baseArg, candidateArg, outArg, countArg = "20", lifetime = "reuse", supplied] =
    process.argv.slice(2);
  const count = Number(countArg);
  if (
    !baseArg ||
    !candidateArg ||
    !outArg ||
    process.argv.length > 8 ||
    !Number.isInteger(count) ||
    count < 1 ||
    !["reuse", "fresh"].includes(lifetime)
  )
    throw new Error(
      "Usage: repeat-shell-output.mjs BASELINE CANDIDATE OUT.jsonl [20] [reuse|fresh] [INPUT.json]",
    );
  return {
    paths: { baseline: resolve(baseArg), candidate: resolve(candidateArg) },
    output: resolve(outArg),
    count,
    lifetime,
    supplied,
  };
}
async function run() {
  const { paths, output, count, lifetime, supplied } = runArguments();
  const input = await inputFor(paths.baseline, supplied);
  const sentInput = `${JSON.stringify(input)}\n`;
  const binaries = {};
  for (const [label, path] of Object.entries(paths))
    binaries[label] = { path, sha256: digest(await readFile(path)) };
  await writeFile(
    output,
    `${JSON.stringify({
      type: "input",
      case: "shell-perforated-closed",
      sentInput,
      inputSha256: digest(sentInput),
      samplesPerBinary: count,
      lifetime,
      threads: 4,
      binaries,
      comparisonNumericRelativeTolerance: 1e-9,
      note: "Complete raw replies retained; no assumed tie equivalence. SDK provenance recorded separately.",
    })}\n`,
  );
  const clients =
    lifetime === "reuse"
      ? Object.fromEntries(Object.entries(paths).map(([label, path]) => [label, instrument(path)]))
      : {};
  const first = {},
    totals = { baselineRepeatDiff: 0, candidateRepeatDiff: 0, crossDiff: 0 };
  try {
    for (let block = 0; block < count; ++block) {
      const pair = {};
      for (const label of block % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
        const worker = clients[label] ?? instrument(paths[label]);
        try {
          pair[label] = await worker.request(input);
        } finally {
          if (lifetime === "fresh") await worker.client.close();
        }
      }
      for (const label of ["baseline", "candidate"]) {
        const observed = pair[label],
          reference = first[label] ?? observed.reply;
        first[label] ??= observed.reply;
        const repeatDiffs = differences(reference, observed.reply);
        const crossDiffs =
          label === "candidate" ? differences(pair.baseline.reply, observed.reply) : null;
        if (repeatDiffs.length) totals[`${label}RepeatDiff`]++;
        if (crossDiffs?.length) totals.crossDiff++;
        await appendFile(
          output,
          `${JSON.stringify({
            type: "reply",
            label,
            block,
            rawReply: observed.rawReply,
            milliseconds: observed.milliseconds,
            phases: observed.phases,
            repeatDiffs,
            repeatBRep: brepComparison(reference, observed.reply),
            crossDiffs,
            crossBRep:
              label === "candidate" ? brepComparison(pair.baseline.reply, observed.reply) : null,
            evidence: targetEvidence(observed.reply),
          })}\n`,
        );
        console.log(
          JSON.stringify({
            label,
            block,
            repeatDifferences: repeatDiffs.length,
            crossDifferences: crossDiffs?.length ?? null,
            thickness: observed.reply.results?.[0]?.faces?.[1]?.thickness ?? null,
          }),
        );
      }
    }
    await appendFile(output, `${JSON.stringify({ type: "summary", totals })}\n`);
  } finally {
    for (const worker of Object.values(clients)) await worker.client.close();
  }
}
await run();
