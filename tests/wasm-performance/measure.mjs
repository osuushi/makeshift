import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { EdgeSizeLimit } from "../../.cache/sketch-tests/src/backend/edge-size-limit.js";

export function summarize(reply) {
  if (reply.error) return { error: reply.error };
  return {
    replyHash: createHash("sha256").update(JSON.stringify(reply)).digest("hex"),
    results: reply.results.map((body) => ({
      volume: body.volume,
      bounds: body.bounds,
      faces: body.faces.length,
      edges: body.edges.length,
      triangles: body.faces.reduce((n, face) => n + face.vertices.length / 9, 0),
      brepHash: createHash("sha256").update(body.brep).digest("hex"),
    })),
  };
}

export function compare(actual, expected) {
  assert.equal(actual.error, expected.error);
  if (actual.error) return;
  assert.equal(actual.results.length, expected.results.length);
  for (const [index, body] of actual.results.entries()) {
    const reference = expected.results[index];
    assert.equal(body.faces, reference.faces);
    assert.equal(body.edges, reference.edges);
    assert.ok(Math.abs(body.volume - reference.volume) <= Math.max(1e-6, reference.volume * 1e-7));
    body.bounds.forEach((v, i) => {
      assert.ok(Math.abs(v - reference.bounds[i]) < 1e-5);
    });
  }
}

export async function measure(client, scenario) {
  const probes = [];
  const calculate = async (size) => {
    const measurement = await client.request({ ...scenario.input, size });
    probes.push({ ...measurement, size, reply: summarize(measurement.reply) });
    if (measurement.reply.error) throw new Error(measurement.reply.error);
    return measurement.reply;
  };
  let reply, size;
  if (scenario.limitDocument) {
    const limited = await new EdgeSizeLimit().calculate(
      scenario.limitDocument,
      scenario.input,
      calculate,
    );
    reply = limited.result;
    size = limited.size;
  } else {
    const measurement = await client.request(scenario.input);
    reply = measurement.reply;
    probes.push({ ...measurement, reply: summarize(reply) });
  }
  return {
    name: scenario.name,
    milliseconds: probes.reduce((sum, probe) => sum + probe.milliseconds, 0),
    size,
    outcome: summarize(reply),
    probes,
  };
}

export function summary(samples) {
  const sorted = [...samples].sort((a, b) => a.milliseconds - b.milliseconds);
  const middle = sorted[Math.floor(sorted.length / 2)];
  const phases = {};
  for (const probe of middle.probes)
    for (const line of probe.phases.split("\n")) {
      const match = /^kernel (\S+) (\S+) ([\d.e+-]+) ms$/.exec(line);
      if (match) {
        const key = `${match[1]}/${match[2]}`;
        phases[key] = (phases[key] ?? 0) + Number(match[3]);
      }
    }
  return {
    median: middle.milliseconds,
    min: sorted[0].milliseconds,
    max: sorted.at(-1).milliseconds,
    samples: samples.length,
    probes: samples[0].probes.length,
    size: samples[0].size,
    phases,
  };
}
