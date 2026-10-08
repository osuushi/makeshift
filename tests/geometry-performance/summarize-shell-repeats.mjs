// Diagnostic geometry reconciliation, not formal BRep/trimmed-region equality.
// node summarize-shell-repeats.mjs INPUT.jsonl[.gz] OUTPUT.json

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lexical = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
function rounded(value) {
  if (typeof value === "number")
    return Number.isFinite(value)
      ? Number((Math.round(value / 1e-7) * 1e-7).toPrecision(15))
      : null;
  if (Array.isArray(value)) return value.map(rounded);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, rounded(value[key])]),
    );
  return value;
}
function canonicalNormal(normal) {
  if (!Array.isArray(normal)) return normal;
  const first = normal.find((value) => value !== 0);
  return first < 0 ? normal.map((value) => -value) : normal;
}
function curveDescriptor(curve) {
  if (!curve) return null;
  const result = rounded(curve);
  if (result.a && result.b && lexical(result.a, result.b) > 0)
    [result.a, result.b] = [result.b, result.a];
  if (result.normal) result.normal = canonicalNormal(result.normal);
  return result;
}
function edgeDescriptor(edge) {
  if (!edge) return { missing: true };
  const points = rounded(edge.points ?? []);
  const reversed = [];
  for (let i = points.length - 3; i >= 0; i -= 3) reversed.push(...points.slice(i, i + 3));
  const samples = lexical(points, reversed) <= 0 ? points : reversed;
  return {
    signature: rounded((edge.signature ?? []).filter((_, index) => index !== 1)),
    predecessors: [...(edge.predecessors ?? [])].sort(),
    curve: curveDescriptor(edge.curve),
    sampleCount: samples.length / 3,
    sampleHash: hash(samples),
    sampleEnds: [samples.slice(0, 3), samples.slice(-3)],
  };
}
function faceDescriptor(face, edgeDescriptors) {
  const incident = (face.edgeIndexes ?? []).map(
    (index) => edgeDescriptors[index] ?? { missingEdge: index },
  );
  incident.sort(lexical); // Preserve multiplicity, including repeated seam uses.
  return {
    signature: rounded(face.signature ?? []), // Includes face orientation.
    predecessors: [...(face.predecessors ?? [])].sort(),
    surface: rounded(
      Object.fromEntries(
        ["plane", "cylinder", "cone", "sphere"]
          .filter((key) => face[key] !== undefined)
          .map((key) => [key, face[key]]),
      ),
    ),
    incidentEdges: incident,
  };
}
function increment(map, key, initial, label) {
  let entry = map.get(key);
  if (!entry) {
    entry = { ...initial, byLabel: {} };
    map.set(key, entry);
  }
  entry.byLabel[label] = (entry.byLabel[label] ?? 0) + 1;
  return entry;
}
function topology(reply) {
  return {
    error: reply.error ?? null,
    mode: reply.mode ?? null,
    results: (reply.results ?? []).map((result) => ({
      faces: result.faces?.length ?? 0,
      edges: result.edges?.length ?? 0,
      volume: rounded(result.volume),
      bounds: rounded(result.bounds),
      predecessorBodies: [...(result.predecessorBodies ?? [])].sort(),
    })),
  };
}
function analyzeResult(result, resultIndex, row, state) {
  const edges = (result.edges ?? []).map(edgeDescriptor);
  const descriptors = (result.faces ?? []).map((face) => faceDescriptor(face, edges));
  const fingerprints = descriptors.map(hash);
  const local = new Map();
  fingerprints.forEach((key, index) => {
    if (!local.has(key)) local.set(key, []);
    local.get(key).push(index);
  });
  for (const [key, indices] of local)
    if (indices.length > 1) {
      const entry = increment(
        state.collisions,
        key,
        { fingerprint: key, descriptor: descriptors[indices[0]], examples: [] },
        row.label,
      );
      if (entry.examples.length < 8)
        entry.examples.push({ label: row.label, block: row.block, resultIndex, indices });
    }
  for (let index = 0; index < fingerprints.length; ++index) {
    const thickness = result.faces[index].thickness ?? null;
    const target = thickness?.faceIndex;
    const targetFingerprint = Number.isInteger(target)
      ? (fingerprints[target] ?? "invalid-reference")
      : null;
    const relation = {
      source: fingerprints[index],
      target: targetFingerprint,
      distance: rounded(thickness?.distance ?? null),
      slope: rounded(thickness?.slope ?? null),
      nullThickness: thickness === null,
    };
    const entry = increment(state.relations, hash(relation), relation, row.label);
    entry.indices ??= {};
    const indexKey = JSON.stringify([row.label, resultIndex, index, target ?? null]);
    entry.indices[indexKey] = (entry.indices[indexKey] ?? 0) + 1;
    if (index === 1) {
      const evidence = {
        sourceFingerprint: fingerprints[index],
        source: descriptors[index],
        targetFingerprint,
        target: descriptors[target] ?? null,
        thickness: rounded(thickness),
        sourceIndex: index,
        targetIndex: target ?? null,
      };
      const selected = increment(state.face1, hash(evidence), evidence, row.label);
      selected.blocks ??= [];
      selected.blocks.push(row.block);
    }
  }
  return {
    volume: rounded(result.volume),
    bounds: rounded(result.bounds),
    predecessorBodies: [...(result.predecessorBodies ?? [])].sort(),
    faces: fingerprints.sort(),
    edges: edges.map(hash).sort(),
  };
}
function consume(row, state) {
  if (row.type === "input") {
    const { sentInput, ...metadata } = row;
    state.inputs.push({ ...metadata, sentInputBytes: Buffer.byteLength(sentInput ?? "") });
    return;
  }
  if (row.type !== "reply") return;
  const reply = JSON.parse(row.rawReply);
  state.records++;
  state.counts[row.label] = (state.counts[row.label] ?? 0) + 1;
  const resultDescriptors = (reply.results ?? []).map((result, index) =>
    analyzeResult(result, index, row, state),
  );
  resultDescriptors.sort(lexical); // Diagnostic result multiset, not ordered acceptance.
  const geometry = { error: reply.error ?? null, results: resultDescriptors };
  increment(
    state.geometry,
    hash(geometry),
    {
      hash: hash(geometry),
      topology: topology(reply),
    },
    row.label,
  );
  const exactBreps = (reply.results ?? []).map((result) => result.brep ?? null);
  increment(
    state.breps,
    hash(exactBreps),
    {
      hash: hash(exactBreps),
      resultCount: exactBreps.length,
    },
    row.label,
  );
  const meta = { label: row.label, block: row.block };
  state.observations.push({
    ...meta,
    geometryHash: hash(geometry),
    exactBRepHash: hash(exactBreps),
    topology: topology(reply),
    repeatDifferenceCount: row.repeatDiffs?.length ?? null,
    crossDifferenceCount: row.crossDiffs?.length ?? null,
  });
}
async function run() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || process.argv.length !== 4)
    throw new Error("Usage: summarize-shell-repeats.mjs INPUT.jsonl[.gz] OUTPUT.json");
  const state = {
    records: 0,
    counts: {},
    inputs: [],
    observations: [],
    geometry: new Map(),
    breps: new Map(),
    relations: new Map(),
    collisions: new Map(),
    face1: new Map(),
  };
  const raw = createReadStream(input),
    stream = input.endsWith(".gz") ? raw.pipe(createGunzip()) : raw;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) consume(JSON.parse(line), state);
  const summary = {
    input,
    records: state.records,
    counts: state.counts,
    diagnosticOnly: true,
    roundingAbsoluteGeometryUnitStep: 1e-7,
    limitations: [
      "Rounded signatures/supports/boundary samples/history are not formal BRep or trimmed-region equivalence.",
      "Edge orientation ignored; face orientation, history and seam multiplicity retained.",
      "Curve a/b endpoints and unoriented normals canonicalized; sampled spline geometry is approximate evidence.",
      "Descriptor collisions flagged within each result; indistinguishable separate regions require BRep inspection.",
      "Geometry hash compares result/face/edge multisets, not authoritative ordered output or metadata target intent.",
      "Exact BRep hashes remain separate; raw inputs and replies are preserved in the original file.",
    ],
    inputRecords: state.inputs,
    geometryVariants: [...state.geometry.values()],
    exactBRepVariants: [...state.breps.values()],
    descriptorCollisions: [...state.collisions.values()],
    thicknessRelations: [...state.relations.values()],
    face1Evidence: [...state.face1.values()],
    observations: state.observations,
  };
  await writeFile(output, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    JSON.stringify({
      records: state.records,
      counts: state.counts,
      geometryVariants: state.geometry.size,
      exactBRepVariants: state.breps.size,
      descriptorCollisions: state.collisions.size,
      thicknessRelations: state.relations.size,
      face1Evidence: state.face1.size,
      output,
    }),
  );
}
await run();
