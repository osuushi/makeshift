import assert from "node:assert/strict";
import test from "node:test";
import { DocumentOwner } from "../src/backend/document-owner.js";
import type { Body, Face } from "../src/model/body.js";
import type { MeasurementTarget } from "../src/model/measurement.js";
import { emptySketch } from "../src/sketch/document.js";
import { planes } from "../src/sketch/planes.js";
import { lift, prism, square, vertical } from "./body-edge-fixtures.js";

const close = (a: number | undefined, b: number) =>
  assert.ok(a !== undefined && Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const face = (body: Body, f: Face): MeasurementTarget => ({
  kind: "face",
  body: body.id,
  face: f.id,
});
async function measure(owner: DocumentOwner, targets: MeasurementTarget[]) {
  const reply = await owner.call({ kind: "measure", targets });
  assert.equal(reply.error, undefined);
  assert.ok(reply.measurement);
  return reply.measurement;
}

test("exact planar face, edge and mixed gaps exclude diagonal span and preserve history", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, square);
    const caps = body.faces.filter(
      (f) => f.plane && Math.abs(f.plane.u[2]) + Math.abs(f.plane.v[2]) < 1e-7,
    );
    assert.equal(caps.length, 2);
    const before = structuredClone(owner.view);
    const history = (await owner.call({ kind: "read-history" })).history;
    const pair = caps.map((f) => face(body, f));
    const m = await measure(owner, pair);
    close(m.minimumGap?.value, 10);
    close(m.maximumGap?.value, 10);
    close(m.properties.find((p) => p.label === "Parallel distance")?.value, 10);
    assert.equal(m.approximate, false);
    assert.ok(m.relationships.includes("Parallel"));
    const reversed = await measure(owner, [...pair].reverse());
    close(reversed.maximumGap?.value, 10);
    close(reversed.properties.find((p) => p.label === "Parallel distance")?.value, 10);
    const edges = [vertical(body, 0, 0), vertical(body, 20, 0)];
    const e = await measure(
      owner,
      edges.map((e) => ({ kind: "edge", body: body.id, edge: e.id })),
    );
    close(e.maximumGap?.value, 20);
    close(e.minimumGap?.value, 20);
    close(e.properties.find((p) => p.label === "Parallel distance")?.value, 20);
    const top = caps.find((f) => f.plane?.origin[2] === 10);
    const bottomEdge = body.edges.find(
      (e) => e.curve?.kind === "line" && e.curve.a[2] === 0 && e.curve.b[2] === 0,
    );
    assert.ok(top && bottomEdge);
    const mixed: MeasurementTarget[] = [
      face(body, top),
      { kind: "edge", body: body.id, edge: bottomEdge.id },
    ];
    for (const targets of [mixed, [...mixed].reverse()]) {
      const result = await measure(owner, targets);
      close(result.maximumGap?.value, 10);
      close(result.properties.find((p) => p.label === "Parallel distance")?.value, 10);
    }
    const single = await measure(owner, [face(body, top)]);
    close(single.properties.find((p) => p.label === "Area")?.value, 400);
    assert.deepEqual(owner.view, before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
    const bad = await owner.call({
      kind: "measure",
      targets: [{ kind: "face", body: body.id, face: "missing" }],
    });
    assert.ok(bad.error);
    assert.deepEqual(owner.view, before);
    assert.deepEqual((await owner.call({ kind: "read-history" })).history, history);
  } finally {
    owner.close();
  }
});

test("partially overlapping and disjoint faces distinguish gap from shortest distance", async () => {
  const owner = new DocumentOwner();
  try {
    const a = await prism(owner, square);
    const b = await prism(
      owner,
      square.map(([x, y]) => [x + 19.99, y]),
    );
    const cap = (body: Body, z: number) => {
      const found = body.faces.find(
        (f) =>
          f.plane &&
          Math.abs(f.plane.u[2]) + Math.abs(f.plane.v[2]) < 1e-8 &&
          Math.abs(f.plane.origin[2] - z) < 1e-8,
      );
      assert.ok(found);
      return found;
    };
    const m = await measure(owner, [face(a, cap(a, 0)), face(b, cap(b, 10))]);
    close(m.maximumGap?.value, 10);
    assert.equal(m.approximate, false);
    const c = await prism(
      owner,
      square.map(([x, y]) => [x + 40, y]),
    );
    const separated = await measure(owner, [face(a, cap(a, 0)), face(c, cap(c, 10))]);
    assert.equal(separated.maximumGap, undefined);
    close(separated.properties.find((p) => p.label === "Parallel distance")?.value, 10);
    close(separated.distance?.value, Math.sqrt(500));
  } finally {
    owner.close();
  }
});

test("concentric circles and coaxial cylindrical walls expose radius and radial gap", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [10, 6].map((radius, i) => ({
        kind: "circle",
        id: `c${i}`,
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    });
    const walls = body.faces.filter((f) => f.cylinder);
    assert.equal(walls.length, 2);
    const m = await measure(
      owner,
      walls.map((f) => face(body, f)),
    );
    close(m.maximumGap?.value, 4);
    close(m.minimumGap?.value, 4);
    assert.ok(m.relationships.includes("Coaxial"));
    assert.ok(!m.properties.some((p) => p.label === "Parallel distance"));
    assert.equal(m.approximate, false);
    const circles = body.edges.filter(
      (e) => e.curve?.kind === "circle" && Math.abs(e.curve.center[2]) < 1e-8,
    );
    assert.equal(circles.length, 2);
    const c = await measure(
      owner,
      circles.map((e) => ({ kind: "edge", body: body.id, edge: e.id })),
    );
    assert.ok(c.relationships.includes("Concentric"));
    assert.ok(!c.properties.some((p) => p.label === "Parallel distance"));
    close(c.maximumGap?.value, 4);
  } finally {
    owner.close();
  }
});

test("wedge wall maximum is exact over projected overlap and selection order independent", async () => {
  const owner = new DocumentOwner();
  try {
    const body = await prism(owner, [
      [0, 0],
      [20, 0],
      [30, 20],
      [0, 20],
    ]);
    const left = body.faces.find(
      (f) => f.plane && f.vertices.every((v, i) => i % 3 !== 0 || Math.abs(v) < 1e-7),
    );
    const right = body.faces.find(
      (f) =>
        f.plane &&
        f.vertices.every((v, i, all) => i % 3 !== 0 || Math.abs(v - 20 - all[i + 1] / 2) < 1e-7),
    );
    assert.ok(left && right);
    const m = await measure(owner, [face(body, left), face(body, right)]);
    close(m.minimumGap?.value, 20);
    close(m.maximumGap?.value, 30);
    assert.ok(!m.properties.some((p) => p.label === "Parallel distance"));
    assert.equal(m.approximate, false);
    close(
      m.properties.find((p) => p.label === "Plane angle")?.value,
      (Math.atan(0.5) * 180) / Math.PI,
    );
    close((await measure(owner, [face(body, right), face(body, left)])).maximumGap?.value, 30);
  } finally {
    owner.close();
  }
});

test("sketch lines use their world plane and preserve an existing preview", async () => {
  const owner = new DocumentOwner();
  try {
    const sketch = {
      ...emptySketch(planes.YZ),
      curves: [0, 10].map((y, i) => ({
        kind: "segment" as const,
        id: `l${i}`,
        a: { x: 0, y },
        b: { x: 20, y },
        construction: false,
      })),
    };
    assert.equal((await owner.call({ kind: "edit", sketch })).error, undefined);
    const targets: MeasurementTarget[] = sketch.curves.map((c) => ({
      kind: "curve",
      sketch: sketch.id,
      curve: c.id,
    }));
    const m = await measure(owner, targets);
    close(m.maximumGap?.value, 10);
    close(m.properties.find((p) => p.label === "Line angle")?.value, 0);
    assert.equal(
      (
        await owner.call({
          kind: "preview",
          sketch: { ...sketch, curves: sketch.curves.slice(0, 1) },
        })
      ).error,
      undefined,
    );
    const before = structuredClone(owner.view);
    await measure(owner, targets);
    assert.deepEqual(owner.view, before);
  } finally {
    owner.close();
  }
});

test("face holes are excluded and generic curved gaps are explicitly sampled", async () => {
  const owner = new DocumentOwner();
  try {
    const ring = await lift(owner, {
      ...emptySketch(planes.XY),
      curves: [10, 6].map((radius, i) => ({
        kind: "circle" as const,
        id: `r${i}`,
        center: { x: 0, y: 0 },
        radius,
        construction: false,
      })),
    });
    const small = await prism(owner, [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]);
    const ringCap = ring.faces.find((f) => f.plane && Math.abs(f.plane.origin[2] - 10) < 1e-7);
    const smallCap = small.faces.find(
      (f) =>
        f.plane &&
        Math.abs(f.plane.u[2]) + Math.abs(f.plane.v[2]) < 1e-7 &&
        Math.abs(f.plane.origin[2]) < 1e-7,
    );
    assert.ok(ringCap && smallCap);
    const hole = await measure(owner, [face(ring, ringCap), face(small, smallCap)]);
    assert.equal(hole.maximumGap, undefined);
    assert.ok((hole.distance?.value ?? 0) > 10);
    const sketch = {
      ...emptySketch(planes.XY),
      curves: [0, 20].map((x, i) => ({
        kind: "circle" as const,
        id: `c${i}`,
        center: { x, y: 0 },
        radius: 5,
        construction: false,
      })),
    };
    await owner.call({ kind: "edit", sketch });
    const result = await measure(
      owner,
      sketch.curves.map((c) => ({ kind: "curve", sketch: sketch.id, curve: c.id })),
    );
    assert.equal(result.approximate, true);
    assert.ok(result.relationships.includes("Coplanar"));
    close(result.distance?.value, 10);
    assert.ok(
      result.maximumGap && result.maximumGap.value > 10 && result.maximumGap.value < 15,
      "Facing gap excludes the remote back of either circle",
    );
  } finally {
    owner.close();
  }
});
