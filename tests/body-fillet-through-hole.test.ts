import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body } from "../src/model/body.js";
import { finish, prism, vertical } from "./body-edge-fixtures.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/fillet-through-hole.json", "utf8"));

// Independent section integral: a 40 mm long quarter-circle corner cut, less
// the cut material already absent inside the vertical 3.5 mm radius bore.
function expectedVolume(radius: number) {
  const steps = 20000;
  const delta = Math.PI / steps;
  let overlap = 0;
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + delta * i;
    const y = 8 + 3.5 * Math.sin(angle);
    const depth = y < radius ? radius - Math.sqrt(radius ** 2 - (y - radius) ** 2) : 0;
    const weight = i === 0 || i === steps ? 1 : i % 2 ? 4 : 2;
    overlap += weight * depth * 24.5 * Math.cos(angle) ** 2;
  }
  return (
    60000 - Math.PI * 3.5 ** 2 * 37.5 - 40 * radius ** 2 * (1 - Math.PI / 4) + (overlap * delta) / 3
  );
}

function checkRound(body: Body, radius: number) {
  const rounds = body.faces.filter((face) => face.cylinder?.outward === 1);
  assert.equal(
    rounds.length,
    1,
    "The round is one cylinder, including where the bore intersects it",
  );
  const round = rounds[0];
  assert.ok(round.cylinder);
  assert.ok(Math.abs(round.cylinder.radius - radius) < 1e-7);
  assert.ok(Math.abs(round.cylinder.axis[0]) > 1 - 1e-7);
  assert.ok(Math.abs(round.cylinder.origin[1] - (-20 + radius)) < 1e-7);
  assert.ok(Math.abs(round.cylinder.origin[2] - (37.5 - radius)) < 1e-7);
  assert.ok(Math.abs((round.blend?.radius ?? 0) - radius) < 1e-7);
  assert.equal(body.faces.length, 8, "No rolling-ball transition patches around the hole");
  assert.ok(body.faces.every((face) => face.plane || face.cylinder));
  const hole = body.faces.find((face) => face.cylinder?.outward === -1);
  assert.equal(hole?.id, "182a230f-0896-47f9-8c11-7e06f6f03334");
  assert.ok(Math.abs((hole?.cylinder?.radius ?? 0) - 3.5) < 1e-7);
  assert.ok(
    Math.abs(body.volume - expectedVolume(radius)) < 2e-4,
    `Volume ${body.volume} must match the independently integrated cut ${expectedVolume(radius)}`,
  );
  assert.equal(body.id, fixture.document.bodies[0].id);
  return round;
}

test("captured straight fillet stays cylindrical while crossing and passing a bore", async () => {
  const owner = new DocumentOwner();
  try {
    assert.equal((await owner.call({ kind: "open", document: fixture.document })).error, undefined);
    const original = owner.view.data;
    const originalBody = original.bodies?.[0];
    assert.ok(originalBody);
    const edges = fixture.selection.map(({ body, edge }: { body: string; edge: string }) => ({
      body,
      edge,
    }));
    // Includes first contact, the former 7.999 mm limit, and complete passage.
    for (const size of [4, 4.5, 6, 8, 11.5, 12, 16, 30, 6]) {
      const reply = await owner.call({
        kind: "finish-edges",
        operation: { edges, size, mode: "fillet" },
      });
      assert.equal(reply.error, undefined);
      assert.equal(reply.view.edgeSize, size);
      assert.ok(reply.view.candidate?.bodies?.[0]);
      checkRound(reply.view.candidate.bodies[0], size);
      assert.equal(owner.view.data, original);
    }
    await owner.call({ kind: "discard" });
    assert.equal(owner.view.data, original);
    await owner.call({ kind: "finish-edges", operation: { edges, size: 12, mode: "fillet" } });
    await owner.call({ kind: "accept" });
    const accepted = owner.view.data;
    await owner.call({ kind: "undo" });
    assert.deepEqual(owner.view.data, original);
    await owner.call({ kind: "redo" });
    assert.deepEqual(owner.view.data, accepted);
    assert.equal((await owner.call({ kind: "open", document: accepted })).error, undefined);
    const body = owner.view.data.bodies?.[0];
    assert.ok(body);
    const round = checkRound(body, 12);
    for (const radius of [16, 6, 0]) {
      const reply = await owner.call({
        kind: "offset-faces",
        operation: { faces: [{ body: body.id, face: round.id }], distance: 0, radius },
      });
      assert.equal(reply.error, undefined);
      const resized = reply.view.candidate?.bodies?.[0];
      assert.ok(resized);
      if (radius) checkRound(resized, radius);
      else assert.ok(Math.abs(resized.volume - originalBody.volume) < 1e-5);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});

test("straight fillets respect acute and obtuse planar support angles", async () => {
  const owner = new DocumentOwner();
  try {
    for (const degrees of [60, 120]) {
      const angle = (degrees * Math.PI) / 180;
      const body = await prism(owner, [
        [0, 0],
        [20, 0],
        [20 * Math.cos(angle), 20 * Math.sin(angle)],
      ]);
      const rounded = await finish(owner, body, [vertical(body, 0, 0)], 2);
      const removed = 40 * (1 / Math.tan(angle / 2) - (Math.PI - angle) / 2);
      assert.ok(Math.abs(rounded.volume - (body.volume - removed)) < 1e-6);
      assert.equal(rounded.faces.filter((face) => face.cylinder).length, 1);
      assert.equal(rounded.faces.find((face) => face.blend)?.blend?.radius, 2);
      await owner.call({ kind: "discard" });
    }
  } finally {
    owner.close();
  }
});
