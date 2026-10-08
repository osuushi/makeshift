import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { cases } from "./cases.mjs";
import { Client } from "./client.mjs";

// Serialized material verification, not a statistically powered benchmark.
// Run while holding /tmp/makeshift-geometry-compute.lock from the repo root.
// Usage: verify-symmetric.mjs BASELINE CANDIDATE COMPARE_SOLIDS_EXEC OUTPUT_PREFIX
const execute = promisify(execFile);
const translation = [1234, -4567, 123];

function direction([x, y, z]) {
  // Right-handed +90-degree rotation about X maps the XY profile into XZ.
  return [x, -z, y];
}
function point(value) {
  return direction(value).map((coordinate, index) => coordinate + translation[index]);
}
function transformSpan(span) {
  const result = structuredClone(span);
  for (const key of ["a", "b", "c", "center"]) if (result[key]) result[key] = point(result[key]);
  for (const key of ["normal", "axis"]) if (result[key]) result[key] = direction(result[key]);
  return result;
}
function transformInput(input) {
  const result = structuredClone(input);
  result.normal = direction(result.normal);
  result.profiles = result.profiles.map((profile) => ({
    ...profile,
    outer: profile.outer.map(transformSpan),
    holes: profile.holes.map((hole) => hole.map(transformSpan)),
  }));
  return result;
}
function variants(inputs) {
  const selected = new Set(["extrude-symmetric-box", "extrude-symmetric-perforated"]);
  const result = [];
  for (const [name, original] of inputs.filter(([label]) => selected.has(label))) {
    for (const sign of [1, -1]) {
      const base = structuredClone(original);
      base.distance = sign * Math.abs(base.distance);
      const suffix = sign > 0 ? "positive" : "negative";
      const probes = [
        ["plain", base],
        ["angle-zero", { ...base, draft: { mode: "angle", value: 0 } }],
        ["offset-zero", { ...base, draft: { mode: "offset", value: 0 } }],
        ["offset-below-threshold", { ...base, draft: { mode: "offset", value: 1e-11 } }],
        ["translated-xz", transformInput(base)],
      ];
      for (const [variant, input] of probes) result.push([`${name}-${suffix}-${variant}`, input]);
    }
  }
  if (result.length !== 20) throw new Error("Missing symmetric box/perforated input fixtures");
  return result;
}
function overview(native) {
  const reply = native.reply;
  if (reply.error) return { error: reply.error, milliseconds: native.milliseconds };
  return {
    milliseconds: native.milliseconds,
    mode: reply.mode,
    participants: reply.participants,
    results: reply.results.map((result) => ({
      volume: result.volume,
      center: result.center,
      bounds: result.bounds,
      faces: result.faces.length,
      edges: result.edges.length,
    })),
  };
}
async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
async function materialComparison(executable, baseline, candidate) {
  let stdout = "",
    stderr = "",
    exitCode = 0,
    error;
  try {
    ({ stdout, stderr } = await execute(executable, [baseline, candidate], {
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (failure) {
    stdout = failure.stdout ?? "";
    stderr = failure.stderr ?? "";
    exitCode = failure.code ?? 1;
    error = failure.message;
  }
  const rows = [];
  try {
    for (const line of stdout.split("\n").filter((value) => value.trim()))
      rows.push(JSON.parse(line));
  } catch (failure) {
    error = `Malformed material comparison output: ${failure.message}`;
  }
  const comparison = rows.find((row) => row.type === "comparison");
  return {
    ok: exitCode === 0 && !error && comparison?.ok === true,
    exitCode,
    error,
    rows,
    stdout,
    stderr,
  };
}
async function verifyCase(label, input, clients, comparator, prefix) {
  const stem = `${prefix}-${label}`;
  const record = { label, inputFile: `${stem}-input.json`, nativeFiles: {}, ok: false };
  await json(record.inputFile, input);
  const outputs = [];
  for (let side = 0; side < clients.length; ++side) {
    const name = side === 0 ? "baseline" : "candidate";
    try {
      const native = await clients[side].request(input);
      record.nativeFiles[name] = `${stem}-${name}-native.json`;
      await json(record.nativeFiles[name], native);
      record[name] = overview(native);
      outputs.push(native.reply);
    } catch (failure) {
      record[name] = { error: failure.message };
      outputs.push({ error: failure.message });
    }
  }
  if (outputs.some((reply) => reply.error || reply.results?.length !== 1)) {
    record.error = "Native result failed or did not contain exactly one material result";
    return record;
  }
  const paths = [`${stem}-baseline.brep`, `${stem}-candidate.brep`];
  for (let side = 0; side < outputs.length; ++side) {
    const brep = outputs[side].results[0].brep;
    if (typeof brep !== "string" || !/^(?:[0-9a-f]{2})+$/.test(brep))
      throw new Error(`${label}: invalid native BRep hex`);
    await writeFile(paths[side], Buffer.from(brep, "hex"));
  }
  record.brepFiles = paths;
  record.material = await materialComparison(comparator, paths[0], paths[1]);
  record.ok = record.material.ok;
  await json(`${stem}-material.json`, record.material);
  return record;
}
async function main() {
  const [baseline, candidate, comparator, outputPrefix] = process.argv.slice(2);
  if (!baseline || !candidate || !comparator || !outputPrefix || process.argv.length !== 6)
    throw new Error(
      "Usage: verify-symmetric.mjs BASELINE CANDIDATE COMPARE_SOLIDS_EXEC OUTPUT_PREFIX",
    );
  const prefix = resolve(outputPrefix);
  await mkdir(dirname(prefix), { recursive: true });
  const clients = [baseline, candidate].map((path) => new Client(resolve(path), 1));
  const summary = {
    purpose:
      "Symmetric exact material verification; timings are observations, not benchmark claims",
    baseline: resolve(baseline),
    candidate: resolve(candidate),
    comparator: resolve(comparator),
    threads: 1,
    records: [],
    ok: false,
  };
  try {
    // Prepare common fixed inputs once using baseline geometry only.
    const fixed = variants(await cases(clients[0]));
    for (const [label, input] of fixed) {
      let record;
      try {
        record = await verifyCase(label, input, clients, resolve(comparator), prefix);
      } catch (failure) {
        record = { label, ok: false, error: failure.message };
      }
      summary.records.push(record);
      console.log(JSON.stringify(record));
      await json(`${prefix}-summary.json`, summary);
    }
    summary.ok = summary.records.every((record) => record.ok);
  } catch (failure) {
    summary.error = failure.message;
  } finally {
    for (const client of clients) await client.close();
    await json(`${prefix}-summary.json`, summary);
  }
  if (!summary.ok) process.exitCode = 1;
}
await main();
