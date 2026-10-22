import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { MeasurementTarget } from "../src/model/measurement.js";
import { emptySketch, type Sketch } from "../src/sketch/document.js";
import { type PlaneFrame, planes } from "../src/sketch/planes.js";
import { profilesFor } from "../src/sketch/profiles.js";
import { prism, square } from "./body-edge-fixtures.js";

const close = (actual: number | undefined, expected: number) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
const region = (sketch: Sketch): MeasurementTarget => ({
  kind: "profile",
  sketch: sketch.id,
  profile: profilesFor(sketch)[0].key,
});
function rectangle(plane: PlaneFrame): Sketch {
  return {
    ...emptySketch(plane),
    curves: square.map(([x, y], i) => ({
      kind: "segment",
      id: `s${i}`,
      a: { x, y },
      b: { x: square[(i + 1) % 4][0], y: square[(i + 1) % 4][1] },
      construction: false,
    })),
  };
}
async function measure(owner: DocumentOwner, targets: MeasurementTarget[]) {
  const reply = await owner.call({ kind: "measure", targets });
  assert.equal(reply.error, undefined);
  assert.ok(reply.measurement);
  return reply.measurement;
}

test("regions measure as bounded faces against regions, faces and edges without creating bodies", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const base = owner.view.data.sketches[0];
    const elevated = rectangle({ ...planes.XY, origin: [0, 0, 20] });
    assert.equal((await owner.call({ kind: "edit", sketch: elevated })).error, undefined);
    const top = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 2 || Math.abs(v - 10) < 1e-7),
    );
    const edge = body.edges.find(
      (e) => e.curve?.kind === "line" && e.curve.a[2] === 10 && e.curve.b[2] === 10,
    );
    assert.ok(top && edge);
    const before = structuredClone(owner.view),
      history = (await owner.call({ kind: "read-history" })).history;
    const single = await measure(owner, [region(base)]);
    close(single.properties.find((p) => p.label === "Area")?.value, 400);
    for (const targets of [
      [region(base), region(elevated)],
      [region(elevated), region(base)],
    ]) {
      const m = await measure(owner, targets);
      close(m.minimumGap?.value, 20);
      close(m.maximumGap?.value, 20);
      close(m.properties.find((p) => p.label === "Parallel distance")?.value, 20);
      assert.equal(m.approximate, false);
      assert.ok(m.relationships.includes("Parallel"));
    }
    for (const target of [
      { kind: "face" as const, body: body.id, face: top.id },
      { kind: "edge" as const, body: body.id, edge: edge.id },
    ]) {
      const m = await measure(owner, [region(base), target]);
      close(m.distance?.value, 10);
      close(m.maximumGap?.value, 10);
      close(m.properties.find((p) => p.label === "Parallel distance")?.value, 10);
    }
    assert.deepEqual(owner.view, before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
    const bad = await owner.call({
      kind: "measure",
      targets: [{ kind: "profile", sketch: base.id, profile: "missing" }],
    });
    assert.ok(bad.error);
    assert.deepEqual(owner.view, before);
  } finally {
    owner.close();
  }
});

test("region holes and rotated sketch placement use exact trim loops and world planes", async () => {
  const owner = new DocumentOwner();
  try {
    const ring: Sketch = {
      ...emptySketch({ ...planes.XY, origin: [0, 0, 10] }),
      curves: [10, 6].map((radius, i) => ({
        kind: "circle",
        id: `c${i}`,
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    };
    const disk: Sketch = {
      ...emptySketch(planes.XY),
      curves: [
        { kind: "circle", id: "disk", center: { x: 0, y: 0 }, radius: 2, construction: false },
      ],
    };
    for (const sketch of [ring, disk])
      assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const annulus = profilesFor(ring).find((p) => p.holes.length === 1);
    assert.ok(annulus);
    const annular: MeasurementTarget = { kind: "profile", sketch: ring.id, profile: annulus.key };
    close((await measure(owner, [annular])).properties[0].value, Math.PI * 64);
    const gap = await measure(owner, [annular, region(disk)]);
    assert.equal(gap.maximumGap, undefined);
    close(gap.distance?.value, Math.sqrt(116));
    const tilted = rectangle({
      origin: [0, 0, 0],
      u: [1, 0, 0],
      v: [0, Math.SQRT1_2, Math.SQRT1_2],
    });
    assert.equal((await owner.call({ kind: "edit", sketch: tilted })).error, undefined);
    const m = await measure(owner, [region(disk), region(tilted)]);
    close(m.properties.find((p) => p.label === "Plane angle")?.value, 45);
    assert.ok(!m.properties.some((p) => p.label === "Parallel distance"));
    close(m.distance?.value, 0);
    assert.equal(owner.view.data.bodies?.length ?? 0, 0);
    await owner.call({ kind: "undo" });
    assert.ok((await owner.call({ kind: "measure", targets: [region(tilted)] })).error);
  } finally {
    owner.close();
  }
});
