// Correctness only; caller owns /tmp/makeshift-geometry-compute.lock.
// Usage: node verify-rigid-transforms.mjs BASELINE CANDIDATE OUTPUT.jsonl [FILTER=.*]
// Full replies are durable; BRep bytes may change under location representation.
import assert from "node:assert/strict";
import { appendFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { square } from "./cases.mjs";
import { Client, operand } from "./client.mjs";
import { exactBrep, history, match, relative, volume } from "./rigid-transform-checks.mjs";
import { extrude, prepare, transforms } from "./rigid-transform-fixtures.mjs";

const [baseline, candidate, output, filterText = ".*"] = process.argv.slice(2);
assert.ok(baseline && candidate && output, "Expected BASELINE CANDIDATE OUTPUT.jsonl [FILTER]");
const filter = new RegExp(filterText);
await writeFile(output, "", { flag: "wx" });
const clients = [baseline, candidate].map((executable) => new Client(resolve(executable), 1));
let regression = false;
async function save(record) {
  await appendFile(output, `${JSON.stringify(record)}\n`);
}
async function pair(name, inputs, note) {
  const a = await clients[0].request(inputs[0]);
  const repeated = await clients[0].request(inputs[0]);
  const b = await clients[1].request(inputs[1]);
  const delta = relative(volume(a.reply), volume(b.reply));
  const record = {
    type: "check",
    name,
    inputs,
    baseline: a.reply,
    baselineRepeat: repeated.reply,
    candidate: b.reply,
    baselineTrace: a.phases,
    baselineRepeatTrace: repeated.phases,
    candidateTrace: b.phases,
    fullMatch: match(a.reply, b.reply),
    repeatMatch: match(a.reply, repeated.reply),
    relativeVolumeDifference: delta,
    relativeVolumeTolerance: 1e-10,
    exactBrepEqual: exactBrep(a.reply, b.reply),
    repeatExactBrepEqual: exactBrep(a.reply, repeated.reply),
    note,
  };
  await save(record);
  console.error(
    `${name}: ${record.fullMatch}; volume relative ${delta}; ${a.reply.error ?? b.reply.error ?? "ok"}`,
  );
  if (record.repeatMatch === "matched" && record.fullMatch !== "matched") regression = true;
  if (!a.reply.error && b.reply.error) regression = true;
  if (delta !== null && Math.abs(delta) > 1e-10) regression = true;
  return [a.reply, b.reply];
}
async function followups(fixture, replies) {
  if (replies.some((reply) => reply.error || reply.results.length !== 1)) return;
  const bodies = replies.map((reply) => operand(reply.results[0], "transformed"));
  await pair(
    `${fixture.name}-inspect`,
    bodies.map((body) => ({ kind: "inspect", bodies: [body] })),
    "Each executable decodes its own transformed result; checks serialization and world-space metadata.",
  );
  const bounds = replies[0].results[0].bounds;
  const size = Math.min(bounds[3] - bounds[0], bounds[4] - bounds[1]) * 0.3;
  const x = (bounds[0] + bounds[3] - size) / 2,
    y = (bounds[1] + bounds[4] - size) / 2;
  const toolReply = (
    await clients[0].request(extrude(square(x, y, size, bounds[2] - 1), bounds[5] - bounds[2] + 2))
  ).reply;
  await save({ type: "followup-tool", name: fixture.name, reply: toolReply });
  if (!toolReply.error) {
    const tool = operand(toolReply.results[0], "cut-tool");
    await pair(
      `${fixture.name}-cut`,
      bodies.map((body) => ({
        kind: "boolean",
        mode: "subtract",
        ids: [body.id, tool.id],
        bodies: [body, tool],
      })),
      "Identical fixed cutting operand; body representation differs only by transform route.",
    );
  }
  await pair(
    `${fixture.name}-shell`,
    bodies.map((body) => ({
      kind: "shell",
      bodies: [body],
      selection: [{ body: body.id, faces: [] }],
      thickness: -0.5,
    })),
    "Closed shell on transformed/decoded result; matching errors are retained and are not evidence of a successful shell.",
  );
  const commonBody = bodies[1];
  const second = {
    kind: "transform",
    bodies: [commonBody],
    ids: [commonBody.id],
    translation: [2, -3, 1],
    pivot: replies[1].results[0].center,
    axis: [0, 0, 1],
    angle: -17,
    duplicate: false,
  };
  await pair(
    `${fixture.name}-common-located-second-transform`,
    [second, second],
    "Both executables receive the same candidate-generated serialized located body; isolates handling of preexisting locations.",
  );
}
async function verify(fixture) {
  const replies = await pair(
    fixture.name,
    [fixture.input, fixture.input],
    "Ordered full output tolerance1e-9 ignoring only BRep values; true relative volume tolerance1e-10.",
  );
  const expected = fixture.stock.reply.results[0].volume * fixture.volumeFactor;
  const evidence = {
    type: "history",
    name: fixture.name,
    baseline: history(replies[0], fixture),
    candidate: history(replies[1], fixture),
    expectedVolume: expected,
    baselineInvariantRelativeError: relative(expected, volume(replies[0])),
    candidateInvariantRelativeError: relative(expected, volume(replies[1])),
  };
  await save(evidence);
  if (evidence.baseline === "matched" && evidence.candidate !== "matched") regression = true;
  const original = { kind: "inspect", bodies: [fixture.stock.body] };
  const inspected = await pair(
    `${fixture.name}-retained-original`,
    [original, original],
    "Re-inspects the unchanged serialized source. Separate request decoding cannot prove transient native TShape immutability during transform/meshing, or frontend duplicate IDs/Undo behavior.",
  );
  await save({
    type: "original-invariant",
    name: fixture.name,
    baselineRelativeVolumeError: relative(
      fixture.stock.reply.results[0].volume,
      volume(inspected[0]),
    ),
    candidateRelativeVolumeError: relative(
      fixture.stock.reply.results[0].volume,
      volume(inspected[1]),
    ),
  });
  if (fixture.followup) await followups(fixture, replies);
}
try {
  const stocks = await prepare(clients[0]);
  for (const stock of stocks)
    await save({
      type: "fixture",
      name: stock.name,
      input: stock.request,
      reply: stock.reply,
      trace: stock.trace,
    });
  const selected = stocks.flatMap(transforms).filter(({ name }) => filter.test(name));
  assert.ok(selected.length, "No selected transform cases");
  for (const fixture of selected) await verify(fixture);
} finally {
  for (const client of clients) await client.close();
}
if (regression) process.exitCode = 1;
